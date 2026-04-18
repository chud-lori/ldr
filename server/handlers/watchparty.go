package handlers

import (
	"context"
	"encoding/json"
	"net/http"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"
	"go.mongodb.org/mongo-driver/v2/bson"
	"go.mongodb.org/mongo-driver/v2/mongo"
	"go.mongodb.org/mongo-driver/v2/mongo/options"

	"ldr-server/db"
	"ldr-server/models"
)

func GetWatchParty(w http.ResponseWriter, r *http.Request) {
	code := strings.ToUpper(chi.URLParam(r, "code"))

	ctx, cancel := context.WithTimeout(r.Context(), 5*time.Second)
	defer cancel()

	var wp models.WatchParty
	err := db.Col("watchparty").FindOne(ctx, bson.M{"roomId": code}).Decode(&wp)
	if err == mongo.ErrNoDocuments {
		respond(w, http.StatusOK, nil)
		return
	}
	respond(w, http.StatusOK, wp)
}

func SetWatchParty(w http.ResponseWriter, r *http.Request) {
	code := strings.ToUpper(chi.URLParam(r, "code"))

	var body struct {
		VideoID string `json:"videoId"`
		Title   string `json:"title"`
	}
	json.NewDecoder(r.Body).Decode(&body)

	ctx, cancel := context.WithTimeout(r.Context(), 5*time.Second)
	defer cancel()

	filter := bson.M{"roomId": code}
	update := bson.M{"$set": bson.M{"videoId": body.VideoID, "title": body.Title, "roomId": code}}
	opts := options.UpdateOne().SetUpsert(true)
	db.Col("watchparty").UpdateOne(ctx, filter, update, opts)

	w.WriteHeader(http.StatusNoContent)
}

func GetChatHistory(w http.ResponseWriter, r *http.Request) {
	code := strings.ToUpper(chi.URLParam(r, "code"))

	ctx, cancel := context.WithTimeout(r.Context(), 5*time.Second)
	defer cancel()

	cursor, _ := db.Col("chat").Find(ctx,
		bson.M{"roomId": code},
		options.Find().SetSort(bson.M{"createdAt": -1}).SetLimit(100),
	)
	var msgs []models.ChatMessage
	cursor.All(ctx, &msgs)

	// Reverse to chronological
	for i, j := 0, len(msgs)-1; i < j; i, j = i+1, j-1 {
		msgs[i], msgs[j] = msgs[j], msgs[i]
	}

	respond(w, http.StatusOK, msgs)
}

func SaveChatMessage(roomID, uid, name, text string) {
	ctx, cancel := context.WithTimeout(context.Background(), 3*time.Second)
	defer cancel()

	msg := models.ChatMessage{
		RoomID:    roomID,
		UserID:    uid,
		Name:      name,
		Text:      text,
		CreatedAt: time.Now().UnixMilli(),
	}
	db.Col("chat").InsertOne(ctx, msg)
}
