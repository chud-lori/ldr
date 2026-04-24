package handlers

import (
	"context"
	"net/http"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"
	"go.mongodb.org/mongo-driver/v2/bson"

	"ldr-server/db"
	"ldr-server/models"
)

// GetActivity powers the "Since you were away" Dashboard card.
//
// Cutoff = my lastSeenAt (which represents the end of my previous session
// because we deliberately don't touch it on ping — only on disconnect).
// New users with no lastSeenAt fall back to a 24-hour window.
//
// Returns one entry per non-zero category. Mood, drawing strokes, and
// watch-party events are skipped (too noisy / always-fresh).
func GetActivity(w http.ResponseWriter, r *http.Request) {
	code := strings.ToUpper(chi.URLParam(r, "code"))
	uid := userID(r)

	ctx, cancel := context.WithTimeout(r.Context(), 5*time.Second)
	defer cancel()

	var room models.Room
	if err := db.Col("rooms").FindOne(ctx, bson.M{"code": code}).Decode(&room); err != nil {
		http.Error(w, "room not found", http.StatusNotFound)
		return
	}

	var lastSeen time.Time
	for _, m := range room.Members {
		if m.UserID == uid && m.LastSeenAt != nil {
			lastSeen = *m.LastSeenAt
			break
		}
	}
	if lastSeen.IsZero() {
		lastSeen = time.Now().Add(-24 * time.Hour)
	}

	type item struct {
		Kind  string `json:"kind"`
		Count int    `json:"count"`
	}
	out := make([]item, 0, 8)

	add := func(kind string, n int64) {
		if n > 0 {
			out = append(out, item{Kind: kind, Count: int(n)})
		}
	}

	// Plain createdAt > lastSeen counts.
	count := func(col string, extra bson.M) int64 {
		filter := bson.M{
			"roomId":    code,
			"userId":    bson.M{"$ne": uid},
			"createdAt": bson.M{"$gt": lastSeen},
		}
		for k, v := range extra {
			filter[k] = v
		}
		n, _ := db.Col(col).CountDocuments(ctx, filter)
		return n
	}

	add("journal-new", count("journal", nil))
	add("bucket-new", count("bucketlist", nil))
	add("trivia-new", count("trivia", nil))

	// Songs sent to me, still unheard.
	songsIn, _ := db.Col("songs").CountDocuments(ctx, bson.M{
		"roomId":      code,
		"recipientId": uid,
		"status":      "unheard",
		"createdAt":   bson.M{"$gt": lastSeen},
	})
	add("song-received", songsIn)

	// My sent songs that were heard or saved while I was away.
	songsOut, _ := db.Col("songs").CountDocuments(ctx, bson.M{
		"roomId":   code,
		"senderId": uid,
		"heardAt":  bson.M{"$gt": lastSeen},
	})
	add("song-feedback", songsOut)

	// Trivia attempts on my questions — sub-array, so fetch + count manually.
	cursor, _ := db.Col("trivia").Find(ctx, bson.M{"roomId": code, "userId": uid})
	var myQs []models.TriviaQuestion
	cursor.All(ctx, &myQs)
	answeredCount := 0
	for _, q := range myQs {
		for _, a := range q.Attempts {
			if a.UserID != uid && a.CreatedAt.After(lastSeen) {
				answeredCount++
			}
		}
	}
	add("trivia-answered", int64(answeredCount))

	// Journal reactions/cheers on my entries.
	cursor2, _ := db.Col("journal").Find(ctx, bson.M{"roomId": code, "userId": uid})
	var myEntries []models.JournalEntry
	cursor2.All(ctx, &myEntries)
	reactCount := 0
	for _, e := range myEntries {
		for _, react := range e.Reactions {
			if react.UserID != uid && react.At.After(lastSeen) {
				reactCount++
			}
		}
		for _, ch := range e.Cheers {
			if ch.UserID != uid && ch.At.After(lastSeen) {
				reactCount++
			}
		}
	}
	add("journal-reacted", int64(reactCount))

	respond(w, http.StatusOK, out)
}
