package handlers

import (
	"context"
	"encoding/json"
	"net/http"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"
	"go.mongodb.org/mongo-driver/v2/bson"
	"go.mongodb.org/mongo-driver/v2/mongo/options"

	"ldr-server/db"
	"ldr-server/models"
	"ldr-server/ws"
)

func GetJournal(w http.ResponseWriter, r *http.Request) {
	code := strings.ToUpper(chi.URLParam(r, "code"))
	uid := userID(r)
	date := r.URL.Query().Get("date")
	if date == "" {
		date = time.Now().Format("2006-01-02")
	}

	ctx, cancel := context.WithTimeout(r.Context(), 5*time.Second)
	defer cancel()

	cursor, err := db.Col("journal").Find(ctx,
		bson.M{"roomId": code, "date": date},
		options.Find().SetSort(bson.M{"createdAt": 1}),
	)
	if err != nil {
		http.Error(w, "db error", http.StatusInternalServerError)
		return
	}
	var entries []models.JournalEntry
	cursor.All(ctx, &entries)

	var myEntry, partnerEntry *models.JournalEntry
	for i := range entries {
		if entries[i].UserID == uid {
			myEntry = &entries[i]
		} else {
			partnerEntry = &entries[i]
		}
	}

	// Partner's entry only revealed when both have submitted
	result := map[string]any{"myEntry": myEntry, "partnerEntry": nil}
	if myEntry != nil && partnerEntry != nil {
		result["partnerEntry"] = partnerEntry
	}

	respond(w, http.StatusOK, result)
}

func GetJournalAll(w http.ResponseWriter, r *http.Request) {
	code := strings.ToUpper(chi.URLParam(r, "code"))
	uid := userID(r)

	ctx, cancel := context.WithTimeout(r.Context(), 5*time.Second)
	defer cancel()

	cursor, err := db.Col("journal").Find(ctx,
		bson.M{"roomId": code},
		options.Find().SetSort(bson.M{"date": -1}),
	)
	if err != nil {
		http.Error(w, "db error", http.StatusInternalServerError)
		return
	}
	var all []models.JournalEntry
	cursor.All(ctx, &all)

	// Group by date
	type DatePair struct {
		Date         string               `json:"date"`
		MyEntry      *models.JournalEntry `json:"myEntry"`
		PartnerEntry *models.JournalEntry `json:"partnerEntry"`
	}
	dateMap := map[string]*DatePair{}
	for i := range all {
		e := &all[i]
		if dateMap[e.Date] == nil {
			dateMap[e.Date] = &DatePair{Date: e.Date}
		}
		if e.UserID == uid {
			dateMap[e.Date].MyEntry = e
		} else {
			dateMap[e.Date].PartnerEntry = e
		}
	}

	pairs := make([]DatePair, 0, len(dateMap))
	for _, p := range dateMap {
		// Reveal partner only when both submitted
		if p.MyEntry == nil {
			p.PartnerEntry = nil
		}
		pairs = append(pairs, *p)
	}

	respond(w, http.StatusOK, pairs)
}

func SaveJournal(w http.ResponseWriter, r *http.Request) {
	code := strings.ToUpper(chi.URLParam(r, "code"))
	uid := userID(r)

	var body struct {
		Name    string `json:"name"`
		Date    string `json:"date"`
		Content string `json:"content"`
		Mood    string `json:"mood"`
	}
	json.NewDecoder(r.Body).Decode(&body)

	if body.Date == "" {
		body.Date = time.Now().Format("2006-01-02")
	}

	now := time.Now()

	ctx, cancel := context.WithTimeout(r.Context(), 5*time.Second)
	defer cancel()

	// Upsert: one entry per user per date per room
	filter := bson.M{"roomId": code, "userId": uid, "date": body.Date}
	update := bson.M{
		"$set": bson.M{
			"name": body.Name, "content": body.Content,
			"mood": body.Mood, "updatedAt": now,
		},
		"$setOnInsert": bson.M{
			"roomId": code, "userId": uid, "date": body.Date, "createdAt": now,
		},
	}

	opts := options.UpdateOne().SetUpsert(true)
	db.Col("journal").UpdateOne(ctx, filter, update, opts)

	// Server-side broadcast so the partner refreshes even if the sender's
	// WebSocket isn't currently OPEN (the client still sends its own
	// `journal:saved` for immediacy; the listener is idempotent).
	if Hub != nil {
		msg := ws.MarshalMsg("journal:saved", uid, body.Name, map[string]string{"date": body.Date})
		Hub.BroadcastAll(code, msg)
	}

	w.WriteHeader(http.StatusNoContent)
}
