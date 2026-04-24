package handlers

import (
	"context"
	"crypto/rand"
	"encoding/json"
	"math/big"
	"net/http"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"
	"go.mongodb.org/mongo-driver/v2/bson"
	"go.mongodb.org/mongo-driver/v2/mongo"

	"ldr-server/db"
	"ldr-server/models"
	"ldr-server/ws"
)

// broadcastRoomUpdate tells everyone in the room to refetch their room
// metadata (name, theme, members). Used after UpdateRoom / UpdateMe so
// partner views don't go stale without a reconnect.
func broadcastRoomUpdate(code, uid string) {
	if Hub == nil {
		return
	}
	msg := ws.MarshalMsg("room:updated", uid, "", nil)
	Hub.BroadcastAll(code, msg)
}

// applyMemberPrivacy strips opt-out fields from members other than the
// viewer. Currently just lastSeenAt when hideLastSeen is set — the viewer
// always sees their own state so they can manage the toggle.
func applyMemberPrivacy(room *models.Room, viewerUID string) {
	for i := range room.Members {
		if room.Members[i].UserID == viewerUID {
			continue
		}
		if room.Members[i].HideLastSeen {
			room.Members[i].LastSeenAt = nil
		}
	}
}

const charset = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"

func genCode(n int) string {
	b := make([]byte, n)
	for i := range b {
		r, _ := rand.Int(rand.Reader, big.NewInt(int64(len(charset))))
		b[i] = charset[r.Int64()]
	}
	return string(b)
}

func respond(w http.ResponseWriter, status int, v any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	json.NewEncoder(w).Encode(v)
}

func userID(r *http.Request) string {
	return r.Header.Get("X-User-ID")
}

func CreateRoom(w http.ResponseWriter, r *http.Request) {
	var body struct {
		Name     string `json:"name"`
		UserName string `json:"userName"`
	}
	json.NewDecoder(r.Body).Decode(&body)

	uid := genCode(8)
	code := genCode(6)

	now := time.Now()
	room := models.Room{
		Code:         code,
		Name:         body.Name,
		Members:      []models.Member{{UserID: uid, Name: body.UserName}},
		LastActiveAt: &now,
		CreatedAt:    now,
	}

	ctx, cancel := context.WithTimeout(r.Context(), 5*time.Second)
	defer cancel()

	if _, err := db.Col("rooms").InsertOne(ctx, room); err != nil {
		http.Error(w, "failed to create room", http.StatusInternalServerError)
		return
	}

	respond(w, http.StatusCreated, map[string]any{"code": code, "userId": uid, "room": room})
}

func GetRoom(w http.ResponseWriter, r *http.Request) {
	code := strings.ToUpper(chi.URLParam(r, "code"))

	ctx, cancel := context.WithTimeout(r.Context(), 5*time.Second)
	defer cancel()

	var room models.Room
	err := db.Col("rooms").FindOne(ctx, bson.M{"code": code}).Decode(&room)
	if err == mongo.ErrNoDocuments {
		http.Error(w, "room not found", http.StatusNotFound)
		return
	}
	if err != nil {
		http.Error(w, "db error", http.StatusInternalServerError)
		return
	}

	applyMemberPrivacy(&room, userID(r))
	respond(w, http.StatusOK, room)
}

func JoinRoom(w http.ResponseWriter, r *http.Request) {
	code := strings.ToUpper(chi.URLParam(r, "code"))

	var body struct {
		UserName string `json:"userName"`
	}
	json.NewDecoder(r.Body).Decode(&body)
	if strings.TrimSpace(body.UserName) == "" {
		http.Error(w, "name required", http.StatusBadRequest)
		return
	}

	ctx, cancel := context.WithTimeout(r.Context(), 5*time.Second)
	defer cancel()

	var room models.Room
	if err := db.Col("rooms").FindOne(ctx, bson.M{"code": code}).Decode(&room); err != nil {
		if err == mongo.ErrNoDocuments {
			http.Error(w, "room not found", http.StatusNotFound)
		} else {
			http.Error(w, "db error", http.StatusInternalServerError)
		}
		return
	}

	// Check if userId already exists in room (re-join)
	existingUID := r.URL.Query().Get("userId")
	for _, m := range room.Members {
		if m.UserID == existingUID {
			respond(w, http.StatusOK, map[string]any{"userId": existingUID, "room": room})
			return
		}
	}

	if len(room.Members) >= 2 {
		http.Error(w, "room is full", http.StatusForbidden)
		return
	}

	uid := genCode(8)
	member := models.Member{UserID: uid, Name: body.UserName}

	db.Col("rooms").UpdateOne(ctx,
		bson.M{"code": code},
		bson.M{"$push": bson.M{"members": member}},
	)

	// Claim any solo-sent songs (recipientId left blank) for the new joiner —
	// the "letter waiting at the door" behaviour for pre-seeded songs.
	db.Col("songs").UpdateMany(ctx,
		bson.M{"roomId": code, "recipientId": ""},
		bson.M{"$set": bson.M{"recipientId": uid}},
	)

	room.Members = append(room.Members, member)
	respond(w, http.StatusOK, map[string]any{"userId": uid, "room": room})
}

func UpdateMe(w http.ResponseWriter, r *http.Request) {
	code := strings.ToUpper(chi.URLParam(r, "code"))
	uid := userID(r)

	var body struct {
		Name         *string `json:"name,omitempty"`
		Location     *string `json:"location,omitempty"`
		HideLastSeen *bool   `json:"hideLastSeen,omitempty"`
	}
	json.NewDecoder(r.Body).Decode(&body)

	set := bson.M{}
	if body.Name != nil {
		n := strings.TrimSpace(*body.Name)
		if n == "" {
			http.Error(w, "name required", http.StatusBadRequest)
			return
		}
		set["members.$.name"] = n
	}
	if body.Location != nil {
		set["members.$.location"] = strings.TrimSpace(*body.Location)
	}
	if body.HideLastSeen != nil {
		set["members.$.hideLastSeen"] = *body.HideLastSeen
	}
	if len(set) == 0 {
		http.Error(w, "nothing to update", http.StatusBadRequest)
		return
	}

	ctx, cancel := context.WithTimeout(r.Context(), 5*time.Second)
	defer cancel()

	db.Col("rooms").UpdateOne(ctx,
		bson.M{"code": code, "members.userId": uid},
		bson.M{"$set": set},
	)

	var updated models.Room
	db.Col("rooms").FindOne(ctx, bson.M{"code": code}).Decode(&updated)
	applyMemberPrivacy(&updated, uid)
	broadcastRoomUpdate(code, uid)
	respond(w, http.StatusOK, updated)
}

func UpdateRoom(w http.ResponseWriter, r *http.Request) {
	code := strings.ToUpper(chi.URLParam(r, "code"))
	uid := userID(r)

	var body struct {
		Name  string `json:"name"`
		Theme string `json:"theme"`
	}
	json.NewDecoder(r.Body).Decode(&body)

	ctx, cancel := context.WithTimeout(r.Context(), 5*time.Second)
	defer cancel()

	var room models.Room
	if err := db.Col("rooms").FindOne(ctx, bson.M{"code": code}).Decode(&room); err != nil {
		if err == mongo.ErrNoDocuments {
			http.Error(w, "room not found", http.StatusNotFound)
		} else {
			http.Error(w, "db error", http.StatusInternalServerError)
		}
		return
	}
	isMember := false
	for _, m := range room.Members {
		if m.UserID == uid {
			isMember = true
			break
		}
	}
	if !isMember {
		http.Error(w, "forbidden", http.StatusForbidden)
		return
	}

	set := bson.M{}
	if body.Name != "" {
		set["name"] = body.Name
	}
	if body.Theme != "" {
		set["theme"] = body.Theme
	}
	if len(set) > 0 {
		db.Col("rooms").UpdateOne(ctx, bson.M{"code": code}, bson.M{"$set": set})
	}

	var updated models.Room
	db.Col("rooms").FindOne(ctx, bson.M{"code": code}).Decode(&updated)
	applyMemberPrivacy(&updated, uid)
	broadcastRoomUpdate(code, uid)
	respond(w, http.StatusOK, updated)
}

func DeleteRoom(w http.ResponseWriter, r *http.Request) {
	code := strings.ToUpper(chi.URLParam(r, "code"))
	uid := userID(r)

	ctx, cancel := context.WithTimeout(r.Context(), 5*time.Second)
	defer cancel()

	// Only a member of the room can delete it
	var room models.Room
	if err := db.Col("rooms").FindOne(ctx, bson.M{"code": code}).Decode(&room); err != nil {
		if err == mongo.ErrNoDocuments {
			http.Error(w, "room not found", http.StatusNotFound)
		} else {
			http.Error(w, "db error", http.StatusInternalServerError)
		}
		return
	}
	isMember := false
	for _, m := range room.Members {
		if m.UserID == uid {
			isMember = true
			break
		}
	}
	if !isMember {
		http.Error(w, "forbidden", http.StatusForbidden)
		return
	}

	// Delete room and all associated data
	for _, col := range []string{"rooms", "journal", "bucketlist", "trivia", "watchparty", "chat", "puzzle", "milestones", "drawing", "songs", "moods", "messages", "films"} {
		db.Col(col).DeleteMany(ctx, bson.M{"roomId": code})
	}
	PurgeRoomMedia(code)
	db.Col("rooms").DeleteOne(ctx, bson.M{"code": code})

	w.WriteHeader(http.StatusNoContent)
}

func SetMeetup(w http.ResponseWriter, r *http.Request) {
	code := strings.ToUpper(chi.URLParam(r, "code"))

	var body struct {
		Date string `json:"date"` // RFC3339
	}
	json.NewDecoder(r.Body).Decode(&body)

	t, err := time.Parse(time.RFC3339, body.Date)
	if err != nil {
		t, err = time.Parse("2006-01-02", body.Date)
		if err != nil {
			http.Error(w, "invalid date", http.StatusBadRequest)
			return
		}
	}

	ctx, cancel := context.WithTimeout(r.Context(), 5*time.Second)
	defer cancel()

	db.Col("rooms").UpdateOne(ctx,
		bson.M{"code": code},
		bson.M{"$set": bson.M{"nextMeetup": t}},
	)

	w.WriteHeader(http.StatusNoContent)
}
