package handlers

import (
	"context"
	"io"
	"net/http"
	"os"
	"path/filepath"
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
const maxMessageImageBytes = 5 * 1024 * 1024 // 5 MB

func messageImageDir(code string) string {
	return filepath.Join(MediaRoot, "rooms", code, "messages")
}

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

// CreateMessage accepts a multipart form with `name`, `text`, and an
// optional `image` file. Either text or image must be present.
func CreateMessage(w http.ResponseWriter, r *http.Request) {
	code := strings.ToUpper(chi.URLParam(r, "code"))
	uid := userID(r)

	if err := r.ParseMultipartForm(maxMessageImageBytes + 1024*1024); err != nil {
		http.Error(w, "form too large", http.StatusBadRequest)
		return
	}

	name := r.FormValue("name")
	text := strings.TrimSpace(r.FormValue("text"))
	if len(text) > maxMessageLength {
		text = text[:maxMessageLength]
	}

	// Pull the image up-front so we can validate before any DB write.
	var imageFile io.ReadCloser
	var imageMime string
	var imageExt string
	if file, header, err := r.FormFile("image"); err == nil {
		defer file.Close()
		mime := header.Header.Get("Content-Type")
		if !strings.HasPrefix(mime, "image/") {
			http.Error(w, "image must be an image file", http.StatusBadRequest)
			return
		}
		if header.Size > maxMessageImageBytes {
			http.Error(w, "image too large (max 5 MB)", http.StatusRequestEntityTooLarge)
			return
		}
		imageFile = file
		imageMime = mime
		imageExt = safeExt(header.Filename, mime)
	}

	if text == "" && imageFile == nil {
		http.Error(w, "text or image required", http.StatusBadRequest)
		return
	}

	ctx, cancel := context.WithTimeout(r.Context(), 30*time.Second)
	defer cancel()

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
		SenderName:  name,
		RecipientID: recipient,
		Text:        text,
		CreatedAt:   time.Now(),
	}

	// If an image was supplied, write it to disk first then reference it
	// from the doc. Random filename = no path-traversal risk.
	if imageFile != nil {
		dir := messageImageDir(code)
		if err := os.MkdirAll(dir, 0o755); err != nil {
			http.Error(w, "fs error", http.StatusInternalServerError)
			return
		}
		filename := randomID(8) + imageExt
		dst, err := os.Create(filepath.Join(dir, filename))
		if err != nil {
			http.Error(w, "fs write error", http.StatusInternalServerError)
			return
		}
		if _, err := io.Copy(dst, imageFile); err != nil {
			dst.Close()
			os.Remove(dst.Name())
			http.Error(w, "fs write error", http.StatusInternalServerError)
			return
		}
		dst.Close()
		msg.ImageFilename = filename
		msg.ImageMime = imageMime
	}

	res, err := db.Col("messages").InsertOne(ctx, msg)
	if err != nil {
		// Best-effort cleanup if DB insert fails after image was written.
		if msg.ImageFilename != "" {
			os.Remove(filepath.Join(messageImageDir(code), msg.ImageFilename))
		}
		http.Error(w, "db error", http.StatusInternalServerError)
		return
	}
	msg.ID = res.InsertedID.(bson.ObjectID)

	if Hub != nil {
		out := ws.MarshalMsg("message:new", uid, name, map[string]string{
			"id": msg.ID.Hex(),
		})
		Hub.BroadcastAll(code, out)
	}

	respond(w, http.StatusCreated, msg)
}

// ServeMessageImage streams the picture attached to a note. RequireMember
// has already gated the room — and notes are scoped to the room, so any
// member of the room is allowed to view either side's images.
func ServeMessageImage(w http.ResponseWriter, r *http.Request) {
	code := strings.ToUpper(chi.URLParam(r, "code"))
	id, err := bson.ObjectIDFromHex(chi.URLParam(r, "id"))
	if err != nil {
		http.NotFound(w, r)
		return
	}

	ctx, cancel := context.WithTimeout(r.Context(), 5*time.Second)
	defer cancel()

	var msg models.Message
	if err := db.Col("messages").FindOne(ctx, bson.M{
		"_id":    id,
		"roomId": code,
	}).Decode(&msg); err != nil {
		http.NotFound(w, r)
		return
	}
	if msg.ImageFilename == "" {
		http.NotFound(w, r)
		return
	}

	w.Header().Set("Cache-Control", "private, max-age=3600")
	http.ServeFile(w, r, filepath.Join(messageImageDir(code), msg.ImageFilename))
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

	// Best-effort: scrub any attached image file too.
	if msg.ImageFilename != "" {
		_ = os.Remove(filepath.Join(messageImageDir(code), msg.ImageFilename))
	}

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
