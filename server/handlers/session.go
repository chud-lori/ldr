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

// parseUID extracts the user ID from a (possibly signed) token.
// A token without a "." separator is treated as a legacy raw userId so
// pre-existing sessions keep working until clients re-issue. Drop that
// fallback once enough time has passed for active users to rotate.
// Returns ok=false only when a signature is present but invalid.
func parseUID(token string) (string, bool) {
	if token == "" {
		return "", false
	}
	i := strings.LastIndex(token, ".")
	if i < 0 {
		return token, true
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
