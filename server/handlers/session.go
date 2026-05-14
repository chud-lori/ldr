package handlers

import (
	"crypto/hmac"
	"crypto/rand"
	"crypto/sha256"
	"encoding/base32"
	"log"
	"os"
	"strings"
	"sync"
)

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
