package handlers

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"regexp"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"
	"go.mongodb.org/mongo-driver/v2/bson"
	"go.mongodb.org/mongo-driver/v2/mongo/options"

	"ldr-server/db"
	"ldr-server/models"
)

// Accepts youtu.be/<id>, youtube.com/watch?v=<id>, youtube.com/shorts/<id>,
// youtube.com/embed/<id>, and music.youtube.com/watch?v=<id>.
var ytRe = regexp.MustCompile(`(?:youtu\.be/|youtube\.com/(?:watch\?v=|embed/|shorts/)|music\.youtube\.com/watch\?v=)([A-Za-z0-9_-]{6,})`)

// Spotify track URL, optionally with an intl-xx locale prefix.
var spotifyRe = regexp.MustCompile(`open\.spotify\.com/(?:intl-[a-z]+/)?track/([A-Za-z0-9]+)`)

type trackMeta struct {
	Provider string `json:"provider"`
	TrackID  string `json:"trackId"`
	URL      string `json:"url"`
	Title    string `json:"title"`
	Artist   string `json:"artist"`
	Thumb    string `json:"thumb"`
}

type oembedMap map[string]any

func (m oembedMap) str(k string) string {
	v, _ := m[k].(string)
	return v
}

func oembed(ctx context.Context, endpoint string) (oembedMap, error) {
	c, cancel := context.WithTimeout(ctx, 5*time.Second)
	defer cancel()
	req, _ := http.NewRequestWithContext(c, "GET", endpoint, nil)
	req.Header.Set("User-Agent", "LDR/1.0 (+https://ldr.lori.my.id)")
	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, err
	}
	if resp.StatusCode >= 400 {
		return nil, fmt.Errorf("oembed %d", resp.StatusCode)
	}
	var m oembedMap
	if err := json.Unmarshal(body, &m); err != nil {
		return nil, err
	}
	return m, nil
}

func parseAndResolveTrack(ctx context.Context, raw string) (*trackMeta, error) {
	raw = strings.TrimSpace(raw)
	if m := ytRe.FindStringSubmatch(raw); m != nil {
		id := m[1]
		canonical := "https://www.youtube.com/watch?v=" + id
		data, err := oembed(ctx, "https://www.youtube.com/oembed?format=json&url="+url.QueryEscape(canonical))
		if err != nil {
			return nil, err
		}
		return &trackMeta{
			Provider: "youtube",
			TrackID:  id,
			URL:      canonical,
			Title:    data.str("title"),
			Artist:   data.str("author_name"),
			Thumb:    data.str("thumbnail_url"),
		}, nil
	}
	if m := spotifyRe.FindStringSubmatch(raw); m != nil {
		id := m[1]
		canonical := "https://open.spotify.com/track/" + id
		data, err := oembed(ctx, "https://open.spotify.com/oembed?url="+url.QueryEscape(canonical))
		if err != nil {
			return nil, err
		}
		// Spotify oEmbed gives only a single "title" field (track name).
		// Artist is surfaced inside the embed iframe itself, so leave blank.
		return &trackMeta{
			Provider: "spotify",
			TrackID:  id,
			URL:      canonical,
			Title:    data.str("title"),
			Thumb:    data.str("thumbnail_url"),
		}, nil
	}
	return nil, fmt.Errorf("unsupported url")
}

// ResolveTrack is called by the compose UI to preview a pasted link
// before the user commits to sending it.
func ResolveTrack(w http.ResponseWriter, r *http.Request) {
	raw := r.URL.Query().Get("url")
	if raw == "" {
		http.Error(w, "url required", http.StatusBadRequest)
		return
	}
	meta, err := parseAndResolveTrack(r.Context(), raw)
	if err != nil {
		http.Error(w, "couldn't recognize that link", http.StatusBadRequest)
		return
	}
	respond(w, http.StatusOK, meta)
}

func ListSongs(w http.ResponseWriter, r *http.Request) {
	code := strings.ToUpper(chi.URLParam(r, "code"))
	ctx, cancel := context.WithTimeout(r.Context(), 5*time.Second)
	defer cancel()

	cursor, err := db.Col("songs").Find(ctx,
		bson.M{"roomId": code},
		options.Find().SetSort(bson.M{"createdAt": -1}),
	)
	if err != nil {
		http.Error(w, "db error", http.StatusInternalServerError)
		return
	}
	var songs []models.Song
	cursor.All(ctx, &songs)
	if songs == nil {
		songs = []models.Song{}
	}

	members := memberNames(ctx, code)
	for i := range songs {
		songs[i].SenderName = freshName(members, songs[i].SenderID, songs[i].SenderName)
	}
	respond(w, http.StatusOK, songs)
}

func CreateSong(w http.ResponseWriter, r *http.Request) {
	code := strings.ToUpper(chi.URLParam(r, "code"))
	uid := userID(r)

	var body struct {
		Name    string `json:"name"`
		URL     string `json:"url"`
		Message string `json:"message"`
	}
	json.NewDecoder(r.Body).Decode(&body)

	ctx, cancel := context.WithTimeout(r.Context(), 8*time.Second)
	defer cancel()

	var room models.Room
	if err := db.Col("rooms").FindOne(ctx, bson.M{"code": code}).Decode(&room); err != nil {
		http.Error(w, "room not found", http.StatusNotFound)
		return
	}
	// Recipient may legitimately be empty when the sender is alone in the
	// room. JoinRoom backfills recipientId for these pending songs when the
	// partner eventually joins.
	var recipient string
	for _, m := range room.Members {
		if m.UserID != uid {
			recipient = m.UserID
			break
		}
	}

	meta, err := parseAndResolveTrack(r.Context(), body.URL)
	if err != nil {
		http.Error(w, "couldn't recognize that link", http.StatusBadRequest)
		return
	}

	song := models.Song{
		RoomID:      code,
		SenderID:    uid,
		SenderName:  body.Name,
		RecipientID: recipient,
		Provider:    meta.Provider,
		TrackID:     meta.TrackID,
		URL:         meta.URL,
		Title:       meta.Title,
		Artist:      meta.Artist,
		Thumb:       meta.Thumb,
		Message:     strings.TrimSpace(body.Message),
		Status:      "unheard",
		CreatedAt:   time.Now(),
	}

	res, err := db.Col("songs").InsertOne(ctx, song)
	if err != nil {
		http.Error(w, "db error", http.StatusInternalServerError)
		return
	}
	song.ID = res.InsertedID.(bson.ObjectID)

	respond(w, http.StatusCreated, song)
}

// UpdateSong is recipient-only. The sender cannot flip status from their
// side; that would let a sender silently mark their own song as heard.
func UpdateSong(w http.ResponseWriter, r *http.Request) {
	code := strings.ToUpper(chi.URLParam(r, "code"))
	uid := userID(r)
	id, err := bson.ObjectIDFromHex(chi.URLParam(r, "id"))
	if err != nil {
		http.Error(w, "invalid id", http.StatusBadRequest)
		return
	}

	var body struct {
		Status string `json:"status"`
	}
	json.NewDecoder(r.Body).Decode(&body)
	switch body.Status {
	case "heard", "saved", "dismissed", "unheard":
	default:
		http.Error(w, "invalid status", http.StatusBadRequest)
		return
	}

	ctx, cancel := context.WithTimeout(r.Context(), 5*time.Second)
	defer cancel()

	now := time.Now()
	set := bson.M{"status": body.Status}
	if body.Status == "heard" || body.Status == "saved" || body.Status == "dismissed" {
		set["heardAt"] = now
	}
	if body.Status == "saved" {
		set["savedAt"] = now
	}
	update := bson.M{"$set": set}
	if body.Status == "unheard" {
		update["$unset"] = bson.M{"savedAt": "", "heardAt": ""}
	}

	filter := bson.M{"_id": id, "roomId": code, "recipientId": uid}
	res, err := db.Col("songs").UpdateOne(ctx, filter, update)
	if err != nil || res.MatchedCount == 0 {
		http.Error(w, "not found", http.StatusNotFound)
		return
	}

	var updated models.Song
	db.Col("songs").FindOne(ctx, bson.M{"_id": id}).Decode(&updated)
	respond(w, http.StatusOK, updated)
}

// DeleteSong lets either the sender (changed their mind) or the recipient
// (permanent trash) drop a song.
func DeleteSong(w http.ResponseWriter, r *http.Request) {
	code := strings.ToUpper(chi.URLParam(r, "code"))
	uid := userID(r)
	id, err := bson.ObjectIDFromHex(chi.URLParam(r, "id"))
	if err != nil {
		http.Error(w, "invalid id", http.StatusBadRequest)
		return
	}

	ctx, cancel := context.WithTimeout(r.Context(), 5*time.Second)
	defer cancel()

	filter := bson.M{
		"_id":    id,
		"roomId": code,
		"$or": []bson.M{
			{"senderId": uid},
			{"recipientId": uid},
		},
	}
	res, err := db.Col("songs").DeleteOne(ctx, filter)
	if err != nil || res.DeletedCount == 0 {
		http.Error(w, "not found", http.StatusNotFound)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}
