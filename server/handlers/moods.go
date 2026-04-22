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

func GetMoods(w http.ResponseWriter, r *http.Request) {
	code := strings.ToUpper(chi.URLParam(r, "code"))

	ctx, cancel := context.WithTimeout(r.Context(), 5*time.Second)
	defer cancel()

	cursor, err := db.Col("moods").Find(ctx, bson.M{"roomId": code})
	if err != nil {
		http.Error(w, "db error", http.StatusInternalServerError)
		return
	}
	var moods []models.Mood
	cursor.All(ctx, &moods)
	if moods == nil {
		moods = []models.Mood{}
	}
	respond(w, http.StatusOK, moods)
}

func SetMood(w http.ResponseWriter, r *http.Request) {
	code := strings.ToUpper(chi.URLParam(r, "code"))
	uid := userID(r)

	var body struct {
		Emoji string `json:"emoji"`
		Note  string `json:"note"`
	}
	json.NewDecoder(r.Body).Decode(&body)
	body.Emoji = strings.TrimSpace(body.Emoji)
	if body.Emoji == "" {
		http.Error(w, "emoji required", http.StatusBadRequest)
		return
	}

	ctx, cancel := context.WithTimeout(r.Context(), 5*time.Second)
	defer cancel()

	now := time.Now()
	filter := bson.M{"roomId": code, "userId": uid}
	update := bson.M{
		"$set": bson.M{
			"emoji":     body.Emoji,
			"note":      strings.TrimSpace(body.Note),
			"updatedAt": now,
		},
		"$setOnInsert": bson.M{
			"roomId": code, "userId": uid,
		},
	}
	db.Col("moods").UpdateOne(ctx, filter, update, options.UpdateOne().SetUpsert(true))

	// Server-side broadcast so partner's Dashboard updates reliably.
	if Hub != nil {
		payload := map[string]string{
			"emoji": body.Emoji,
			"note":  strings.TrimSpace(body.Note),
		}
		msg := ws.MarshalMsg("mood:set", uid, "", payload)
		Hub.BroadcastAll(code, msg)
	}

	w.WriteHeader(http.StatusNoContent)
}
