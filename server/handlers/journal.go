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

	members := memberNames(ctx, code)
	var myEntry, partnerEntry *models.JournalEntry
	for i := range entries {
		entries[i].Name = freshName(members, entries[i].UserID, entries[i].Name)
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
	members := memberNames(ctx, code)
	dateMap := map[string]*DatePair{}
	for i := range all {
		e := &all[i]
		e.Name = freshName(members, e.UserID, e.Name)
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

// allowedReactions are the only emojis accepted on /react. Locked down so
// the journal stays a quick "I'm here for you" surface, not a full reaction
// picker.
var allowedReactions = map[string]bool{
	"❤️": true, "🤗": true, "💪": true, "😢": true, "🔥": true,
}

// React toggles the caller's reaction on a partner's entry for a given
// date. Tapping the same emoji again removes it; tapping a different one
// replaces it. Both partners must have written that day or 403.
func ReactJournal(w http.ResponseWriter, r *http.Request) {
	code := strings.ToUpper(chi.URLParam(r, "code"))
	uid := userID(r)
	date := chi.URLParam(r, "date")
	ownerID := chi.URLParam(r, "userId")

	if ownerID == uid {
		http.Error(w, "react on your own entry?", http.StatusForbidden)
		return
	}

	var body struct {
		Emoji string `json:"emoji"`
	}
	json.NewDecoder(r.Body).Decode(&body)
	if body.Emoji != "" && !allowedReactions[body.Emoji] {
		http.Error(w, "unsupported emoji", http.StatusBadRequest)
		return
	}

	ctx, cancel := context.WithTimeout(r.Context(), 5*time.Second)
	defer cancel()

	if !bothWroteOn(ctx, code, date) {
		http.Error(w, "wait for both to write today", http.StatusForbidden)
		return
	}

	filter := bson.M{"roomId": code, "userId": ownerID, "date": date}

	// Always pull the caller's existing reaction first; if a new emoji is
	// supplied, push the replacement.
	db.Col("journal").UpdateOne(ctx, filter,
		bson.M{"$pull": bson.M{"reactions": bson.M{"userId": uid}}},
	)

	// Empty emoji = toggle off (just leave it pulled).
	if body.Emoji != "" {
		db.Col("journal").UpdateOne(ctx, filter,
			bson.M{"$push": bson.M{"reactions": models.JournalReaction{
				UserID: uid, Emoji: body.Emoji, At: time.Now(),
			}}},
		)
	}

	if Hub != nil {
		msg := ws.MarshalMsg("journal:reacted", uid, "", map[string]string{
			"date":    date,
			"ownerId": ownerID,
		})
		Hub.BroadcastAll(code, msg)
	}

	w.WriteHeader(http.StatusNoContent)
}

// Cheer attaches a one-line cheer note to a partner's entry. 120-char cap
// keeps it a cheer, not a conversation. Empty text removes the existing
// cheer. Same both-must-have-written gate as React.
func CheerJournal(w http.ResponseWriter, r *http.Request) {
	code := strings.ToUpper(chi.URLParam(r, "code"))
	uid := userID(r)
	date := chi.URLParam(r, "date")
	ownerID := chi.URLParam(r, "userId")

	if ownerID == uid {
		http.Error(w, "cheer on your own entry?", http.StatusForbidden)
		return
	}

	var body struct {
		Text string `json:"text"`
	}
	json.NewDecoder(r.Body).Decode(&body)
	text := strings.TrimSpace(body.Text)
	if len(text) > 120 {
		text = text[:120]
	}

	ctx, cancel := context.WithTimeout(r.Context(), 5*time.Second)
	defer cancel()

	if !bothWroteOn(ctx, code, date) {
		http.Error(w, "wait for both to write today", http.StatusForbidden)
		return
	}

	filter := bson.M{"roomId": code, "userId": ownerID, "date": date}

	// Replace any existing cheer from this user.
	db.Col("journal").UpdateOne(ctx, filter,
		bson.M{"$pull": bson.M{"cheers": bson.M{"userId": uid}}},
	)
	if text != "" {
		db.Col("journal").UpdateOne(ctx, filter,
			bson.M{"$push": bson.M{"cheers": models.JournalCheer{
				UserID: uid, Text: text, At: time.Now(),
			}}},
		)
	}

	if Hub != nil {
		msg := ws.MarshalMsg("journal:cheered", uid, "", map[string]string{
			"date":    date,
			"ownerId": ownerID,
		})
		Hub.BroadcastAll(code, msg)
	}

	w.WriteHeader(http.StatusNoContent)
}

// bothWroteOn returns true if every member of the room has a journal
// entry for the given date — the gate for reveal-only features (reactions
// and cheers).
func bothWroteOn(ctx context.Context, code, date string) bool {
	var room models.Room
	if err := db.Col("rooms").FindOne(ctx, bson.M{"code": code}).Decode(&room); err != nil {
		return false
	}
	for _, m := range room.Members {
		n, _ := db.Col("journal").CountDocuments(ctx,
			bson.M{"roomId": code, "userId": m.UserID, "date": date},
		)
		if n == 0 {
			return false
		}
	}
	return len(room.Members) >= 2
}
