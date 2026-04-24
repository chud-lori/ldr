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

const maxMessageLength = 300

func ListMessages(w http.ResponseWriter, r *http.Request) {
	code := strings.ToUpper(chi.URLParam(r, "code"))
	uid := userID(r)

	ctx, cancel := context.WithTimeout(r.Context(), 5*time.Second)
	defer cancel()

	cursor, err := db.Col("messages").Find(ctx,
		bson.M{"roomId": code, "recipientId": uid},
		options.Find().SetSort(bson.M{"createdAt": -1}),
	)
	if err != nil {
		http.Error(w, "db error", http.StatusInternalServerError)
		return
	}
	var msgs []models.Message
	cursor.All(ctx, &msgs)
	if msgs == nil {
		msgs = []models.Message{}
	}

	// Refresh denormalized senderName from live member list.
	members := memberNames(ctx, code)
	for i := range msgs {
		msgs[i].SenderName = freshName(members, msgs[i].SenderID, msgs[i].SenderName)
	}

	respond(w, http.StatusOK, msgs)
}

func CreateMessage(w http.ResponseWriter, r *http.Request) {
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
	if len(text) > maxMessageLength {
		text = text[:maxMessageLength]
	}

	ctx, cancel := context.WithTimeout(r.Context(), 5*time.Second)
	defer cancel()

	// Find recipient (the other member in the room).
	var room models.Room
	if err := db.Col("rooms").FindOne(ctx, bson.M{"code": code}).Decode(&room); err != nil {
		http.Error(w, "room not found", http.StatusNotFound)
		return
	}
	var recipient string
	for _, m := range room.Members {
		if m.UserID != uid {
			recipient = m.UserID
			break
		}
	}
	if recipient == "" {
		http.Error(w, "partner hasn't joined yet", http.StatusBadRequest)
		return
	}

	msg := models.Message{
		RoomID:      code,
		SenderID:    uid,
		SenderName:  body.Name,
		RecipientID: recipient,
		Text:        text,
		CreatedAt:   time.Now(),
	}
	res, err := db.Col("messages").InsertOne(ctx, msg)
	if err != nil {
		http.Error(w, "db error", http.StatusInternalServerError)
		return
	}
	msg.ID = res.InsertedID.(bson.ObjectID)

	if Hub != nil {
		out := ws.MarshalMsg("message:new", uid, body.Name, map[string]string{
			"id": msg.ID.Hex(),
		})
		Hub.BroadcastAll(code, out)
	}

	respond(w, http.StatusCreated, msg)
}

// ReadMessage marks a message read, broadcasts message:seen for the
// sender's "seen ❤" toast, then hard-deletes the row. Ephemeral by design.
func ReadMessage(w http.ResponseWriter, r *http.Request) {
	code := strings.ToUpper(chi.URLParam(r, "code"))
	uid := userID(r)
	id, err := bson.ObjectIDFromHex(chi.URLParam(r, "id"))
	if err != nil {
		http.Error(w, "invalid id", http.StatusBadRequest)
		return
	}

	ctx, cancel := context.WithTimeout(r.Context(), 5*time.Second)
	defer cancel()

	// Recipient-only: caller must be the addressee.
	var msg models.Message
	if err := db.Col("messages").FindOne(ctx,
		bson.M{"_id": id, "roomId": code, "recipientId": uid},
	).Decode(&msg); err != nil {
		http.Error(w, "not found", http.StatusNotFound)
		return
	}

	db.Col("messages").DeleteOne(ctx, bson.M{"_id": id})

	if Hub != nil {
		out := ws.MarshalMsg("message:seen", uid, "", map[string]any{
			"id":       id.Hex(),
			"senderId": msg.SenderID,
			"readAt":   time.Now(),
		})
		Hub.BroadcastAll(code, out)
	}

	w.WriteHeader(http.StatusNoContent)
}
