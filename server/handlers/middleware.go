package handlers

import (
	"context"
	"net/http"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"
	"go.mongodb.org/mongo-driver/v2/bson"

	"ldr-server/db"
)

// RequireMember rejects requests where X-User-ID is not a member of the room in the URL.
func RequireMember(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		code := strings.ToUpper(chi.URLParam(r, "code"))
		uid := userID(r)
		if code == "" || uid == "" {
			http.Error(w, "forbidden", http.StatusForbidden)
			return
		}
		ctx, cancel := context.WithTimeout(r.Context(), 3*time.Second)
		defer cancel()
		n, _ := db.Col("rooms").CountDocuments(ctx, bson.M{"code": code, "members.userId": uid})
		if n == 0 {
			http.Error(w, "forbidden", http.StatusForbidden)
			return
		}
		next.ServeHTTP(w, r)
	})
}

// isMemberOf returns true when uid is recorded in the room's members list.
func isMemberOf(ctx context.Context, code, uid string) bool {
	n, _ := db.Col("rooms").CountDocuments(ctx, bson.M{"code": code, "members.userId": uid})
	return n > 0
}
