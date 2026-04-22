package handlers

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"
	"go.mongodb.org/mongo-driver/v2/bson"
	"go.mongodb.org/mongo-driver/v2/mongo"
	"go.mongodb.org/mongo-driver/v2/mongo/options"

	"ldr-server/db"
	"ldr-server/models"
	"ldr-server/ws"
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

func AddToQueue(w http.ResponseWriter, r *http.Request) {
	code := strings.ToUpper(chi.URLParam(r, "code"))
	uid := userID(r)

	var body struct {
		VideoID string `json:"videoId"`
		Title   string `json:"title"`
	}
	json.NewDecoder(r.Body).Decode(&body)
	body.VideoID = strings.TrimSpace(body.VideoID)
	if body.VideoID == "" {
		http.Error(w, "videoId required", http.StatusBadRequest)
		return
	}

	ctx, cancel := context.WithTimeout(r.Context(), 5*time.Second)
	defer cancel()

	item := models.QueueItem{VideoID: body.VideoID, Title: body.Title, AddedBy: uid}
	db.Col("watchparty").UpdateOne(ctx,
		bson.M{"roomId": code},
		bson.M{"$push": bson.M{"queue": item}, "$setOnInsert": bson.M{"roomId": code}},
		options.UpdateOne().SetUpsert(true),
	)

	returnWatchParty(w, r.Context(), code, http.StatusCreated)
}

func RemoveFromQueue(w http.ResponseWriter, r *http.Request) {
	code := strings.ToUpper(chi.URLParam(r, "code"))
	idxStr := chi.URLParam(r, "index")

	var idx int
	if _, err := fmt.Sscanf(idxStr, "%d", &idx); err != nil || idx < 0 {
		http.Error(w, "bad index", http.StatusBadRequest)
		return
	}

	ctx, cancel := context.WithTimeout(r.Context(), 5*time.Second)
	defer cancel()

	var wp models.WatchParty
	if err := db.Col("watchparty").FindOne(ctx, bson.M{"roomId": code}).Decode(&wp); err != nil {
		http.Error(w, "not found", http.StatusNotFound)
		return
	}
	if idx >= len(wp.Queue) {
		http.Error(w, "index out of range", http.StatusBadRequest)
		return
	}
	wp.Queue = append(wp.Queue[:idx], wp.Queue[idx+1:]...)
	db.Col("watchparty").UpdateOne(ctx,
		bson.M{"roomId": code},
		bson.M{"$set": bson.M{"queue": wp.Queue}},
	)

	returnWatchParty(w, r.Context(), code, http.StatusOK)
}

func PlayNext(w http.ResponseWriter, r *http.Request) {
	code := strings.ToUpper(chi.URLParam(r, "code"))

	ctx, cancel := context.WithTimeout(r.Context(), 5*time.Second)
	defer cancel()

	var wp models.WatchParty
	if err := db.Col("watchparty").FindOne(ctx, bson.M{"roomId": code}).Decode(&wp); err != nil {
		http.Error(w, "not found", http.StatusNotFound)
		return
	}
	if len(wp.Queue) == 0 {
		http.Error(w, "queue empty", http.StatusBadRequest)
		return
	}
	next := wp.Queue[0]
	wp.Queue = wp.Queue[1:]
	db.Col("watchparty").UpdateOne(ctx,
		bson.M{"roomId": code},
		bson.M{"$set": bson.M{
			"videoId": next.VideoID,
			"title":   next.Title,
			"queue":   wp.Queue,
		}},
	)

	returnWatchParty(w, r.Context(), code, http.StatusOK)
}

func returnWatchParty(w http.ResponseWriter, parent context.Context, code string, status int) {
	ctx, cancel := context.WithTimeout(parent, 5*time.Second)
	defer cancel()
	var wp models.WatchParty
	db.Col("watchparty").FindOne(ctx, bson.M{"roomId": code}).Decode(&wp)
	respond(w, status, wp)
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

	members := memberNames(ctx, code)
	for i := range msgs {
		msgs[i].Name = freshName(members, msgs[i].UserID, msgs[i].Name)
	}

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

// SendChat handles POST /rooms/:code/chat. Persists and server-broadcasts
// so delivery is independent of the sender's WS state. Live typing in the
// Watch Party page still reaches the partner via the existing chat:send
// WS listener; the sender adds their own message optimistically.
func SendChat(w http.ResponseWriter, r *http.Request) {
	code := strings.ToUpper(chi.URLParam(r, "code"))
	uid := userID(r)

	var body struct {
		Name string `json:"name"`
		Text string `json:"text"`
	}
	json.NewDecoder(r.Body).Decode(&body)
	text := strings.TrimSpace(body.Text)
	if text == "" {
		http.Error(w, "text required", http.StatusBadRequest)
		return
	}

	SaveChatMessage(code, uid, body.Name, text)

	if Hub != nil {
		msg := ws.MarshalMsg("chat:send", uid, body.Name, map[string]string{"text": text})
		Hub.BroadcastAll(code, msg)
	}

	w.WriteHeader(http.StatusNoContent)
}
