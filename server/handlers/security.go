package handlers

import (
	"net"
	"net/http"
	"os"
	"strings"
	"sync"
	"time"
)

// trustProxyHeaders gates whether X-Forwarded-For / X-Real-IP can be
// trusted. Set TRUST_PROXY_HEADERS=1 only when running behind a proxy
// that strips these headers from inbound requests and rewrites them
// (Cloudflare, an ALB, fly.io, etc). On bare metal it must stay off,
// otherwise the rate limiter and audit logs read attacker-controlled IPs.
var trustProxyHeaders = func() bool {
	v := strings.ToLower(strings.TrimSpace(os.Getenv("TRUST_PROXY_HEADERS")))
	return v == "1" || v == "true" || v == "yes"
}()

// SecurityHeaders sets defensive headers on every response. Tuned for an
// SPA served same-origin: HSTS for transport, no framing, no MIME sniffing,
// minimum-leak Referer, and a Permissions-Policy that blanket-denies the
// risky APIs we don't use (camera/mic stay self-allowed for film roll).
func SecurityHeaders(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		h := w.Header()
		h.Set("Strict-Transport-Security", "max-age=31536000; includeSubDomains")
		h.Set("X-Content-Type-Options", "nosniff")
		h.Set("X-Frame-Options", "DENY")
		h.Set("Referrer-Policy", "strict-origin-when-cross-origin")
		h.Set("Permissions-Policy", "geolocation=(), camera=(self), microphone=(self), payment=(), usb=()")
		next.ServeHTTP(w, r)
	})
}

type rateBucket struct {
	count int
	reset time.Time
}

// RateLimit allows up to `burst` requests per IP per `window`. Excess
// requests get 429. In-memory only — fine for a two-person app behind a
// single backend; swap for a real limiter if this ever scales horizontally.
func RateLimit(burst int, window time.Duration) func(http.Handler) http.Handler {
	var (
		mu      sync.Mutex
		buckets = map[string]*rateBucket{}
	)
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			ip := clientIP(r)
			now := time.Now()

			mu.Lock()
			// Cap map growth: if we've collected too many buckets, drop the
			// expired ones in one pass before inserting more.
			if len(buckets) > 1024 {
				for k, b := range buckets {
					if now.After(b.reset) {
						delete(buckets, k)
					}
				}
			}
			b, ok := buckets[ip]
			if !ok || now.After(b.reset) {
				buckets[ip] = &rateBucket{count: 1, reset: now.Add(window)}
				mu.Unlock()
				next.ServeHTTP(w, r)
				return
			}
			if b.count >= burst {
				retry := int(time.Until(b.reset).Seconds()) + 1
				mu.Unlock()
				w.Header().Set("Retry-After", itoa(retry))
				http.Error(w, "too many requests", http.StatusTooManyRequests)
				return
			}
			b.count++
			mu.Unlock()
			next.ServeHTTP(w, r)
		})
	}
}

func itoa(n int) string {
	if n <= 0 {
		return "1"
	}
	// small fast int->string for Retry-After header
	var b [10]byte
	i := len(b)
	for n > 0 {
		i--
		b[i] = byte('0' + n%10)
		n /= 10
	}
	return string(b[i:])
}

func clientIP(r *http.Request) string {
	if trustProxyHeaders {
		if xff := r.Header.Get("X-Forwarded-For"); xff != "" {
			// XFF is appended-to by each hop, so the left-most entry is the
			// client. We only reach this branch when the operator has
			// asserted there is a sanitising proxy in front.
			if i := strings.Index(xff, ","); i >= 0 {
				return strings.TrimSpace(xff[:i])
			}
			return strings.TrimSpace(xff)
		}
		if rip := r.Header.Get("X-Real-IP"); rip != "" {
			return rip
		}
	}
	host, _, err := net.SplitHostPort(r.RemoteAddr)
	if err != nil {
		return r.RemoteAddr
	}
	return host
}
