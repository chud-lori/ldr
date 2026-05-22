package handlers

import (
	"crypto/hmac"
	"crypto/rand"
	"crypto/sha256"
	"encoding/base32"
	"encoding/json"
	"log"
	"net/http"
	"os"
	"strconv"
	"strings"
	"sync"
	"time"
)

// mediaTokenTTL is the lifetime of a `?t=` media token. Kept short so that
// a token leaked via the request log or a cross-origin Referer header
// becomes useless within a few minutes — long enough that a typical
// dashboard or film-roll view doesn't need to re-mint mid-render, short
// enough that journalctl exposure is a window, not a key.
const mediaTokenTTL = 10 * time.Minute

var (
	sessionSecret     []byte
	sessionSecretOnce sync.Once
)

// Base32 (uppercase A-Z + 2-7) survives a `.toUpperCase()` round-trip,
// which Home.jsx applies to personal-link params to compensate for chat
// clients that lowercase displayed URLs.
var sigEnc = base32.StdEncoding.WithPadding(base32.NoPadding)

func getSessionSecret() []byte {
	sessionSecretOnce.Do(func() {
		s := os.Getenv("SESSION_SECRET")
		if s != "" {
			sessionSecret = []byte(s)
			return
		}
		buf := make([]byte, 32)
		if _, err := rand.Read(buf); err != nil {
			log.Fatal("session: cannot generate ephemeral secret:", err)
		}
		sessionSecret = buf
		log.Println("WARNING: SESSION_SECRET not set — generated an ephemeral secret. All sessions will be invalidated on restart.")
	})
	return sessionSecret
}

// signUID returns "uid.SIGNATURE" — proves the uid was issued by this server.
func signUID(uid string) string {
	mac := hmac.New(sha256.New, getSessionSecret())
	mac.Write([]byte(uid))
	return uid + "." + sigEnc.EncodeToString(mac.Sum(nil))
}

// parseUID extracts the user ID from a signed token. Returns ok=false
// for any token that isn't of the form "uid.SIGNATURE" with a valid HMAC.
// Clients with stale unsigned tokens get bounced to the join screen — a
// one-time cost worth paying so that knowing a raw userId cannot
// impersonate its owner.
func parseUID(token string) (string, bool) {
	if token == "" {
		return "", false
	}
	i := strings.LastIndex(token, ".")
	if i < 0 {
		return "", false
	}
	uid, sig := token[:i], token[i+1:]
	if uid == "" || sig == "" {
		return "", false
	}
	expSig, err := sigEnc.DecodeString(sig)
	if err != nil {
		return "", false
	}
	mac := hmac.New(sha256.New, getSessionSecret())
	mac.Write([]byte(uid))
	if !hmac.Equal(mac.Sum(nil), expSig) {
		return "", false
	}
	return uid, true
}

// signMediaToken returns "uid.EXP.SIGNATURE" — a short-lived token for use
// in <img>/<video> src query strings. exp is unix seconds. The signature
// covers "uid|exp", so an attacker who reads the token from a log cannot
// extend its lifetime by rewriting the exp component.
func signMediaToken(uid string, exp int64) string {
	expStr := strconv.FormatInt(exp, 10)
	mac := hmac.New(sha256.New, getSessionSecret())
	mac.Write([]byte(uid + "|" + expStr))
	return uid + "." + expStr + "." + sigEnc.EncodeToString(mac.Sum(nil))
}

// parseMediaToken accepts only the 3-part media-token format ("uid.exp.sig")
// and rejects 2-part session tokens. The X-User-ID header carries the
// long-lived session token; the `?t=` query param must carry a media token
// so anything that leaks via logs or Referer headers expires on its own.
func parseMediaToken(token string) (string, bool) {
	if token == "" {
		return "", false
	}
	parts := strings.Split(token, ".")
	if len(parts) != 3 {
		return "", false
	}
	uid, expStr, sig := parts[0], parts[1], parts[2]
	if uid == "" || expStr == "" || sig == "" {
		return "", false
	}
	exp, err := strconv.ParseInt(expStr, 10, 64)
	if err != nil {
		return "", false
	}
	if time.Now().Unix() > exp {
		return "", false
	}
	expSig, err := sigEnc.DecodeString(sig)
	if err != nil {
		return "", false
	}
	mac := hmac.New(sha256.New, getSessionSecret())
	mac.Write([]byte(uid + "|" + expStr))
	if !hmac.Equal(mac.Sum(nil), expSig) {
		return "", false
	}
	return uid, true
}

// MediaToken issues a short-lived signed token bound to the caller's uid.
// Requires a valid session token in X-User-ID — the response token is
// then suitable for use as `?t=` on /films/media and /messages/image GETs.
func MediaToken(w http.ResponseWriter, r *http.Request) {
	uid := userID(r)
	if uid == "" {
		http.Error(w, "unauthorized", http.StatusUnauthorized)
		return
	}
	exp := time.Now().Add(mediaTokenTTL).Unix()
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]any{
		"token":     signMediaToken(uid, exp),
		"expiresAt": exp,
	})
}
