package handlers

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"fmt"
	"io"
	"mime"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"
	"go.mongodb.org/mongo-driver/v2/bson"
	"go.mongodb.org/mongo-driver/v2/mongo"
	"go.mongodb.org/mongo-driver/v2/mongo/options"

	"ldr-server/db"
	"ldr-server/models"
)

const (
	maxPhotoBytes = 5 * 1024 * 1024  // 5 MB
	maxVideoBytes = 50 * 1024 * 1024 // 50 MB
	maxItemsPerRoll = 100
	purgeAfterDevelop = 7 * 24 * time.Hour
)

// MediaRoot is the on-disk root for film roll uploads. Configurable so
// dev runs can write to a tmp dir while prod points at /var/lib/ldr/media.
var MediaRoot = func() string {
	if r := os.Getenv("MEDIA_ROOT"); r != "" {
		return r
	}
	return "./media"
}()

// isoWeekPeriod returns "YYYY-Www" for the given time (ISO 8601).
func isoWeekPeriod(t time.Time) string {
	year, week := t.ISOWeek()
	return fmt.Sprintf("%d-W%02d", year, week)
}

// developAtForPeriod returns the moment a given week's roll reveals —
// Monday 00:00 UTC of the following week (i.e. just after Sunday ends).
func developAtForPeriod(t time.Time) time.Time {
	// Move to the start of the week's Monday.
	year, week := t.ISOWeek()
	// Find the Monday of (year, week+1).
	jan4 := time.Date(year, 1, 4, 0, 0, 0, 0, time.UTC)
	// ISO week 1 contains Jan 4. Find Monday of week 1.
	jan4Weekday := int(jan4.Weekday())
	if jan4Weekday == 0 {
		jan4Weekday = 7
	}
	week1Monday := jan4.AddDate(0, 0, 1-jan4Weekday)
	return week1Monday.AddDate(0, 0, 7*week)
}

func randomID(n int) string {
	b := make([]byte, n)
	rand.Read(b)
	return hex.EncodeToString(b)
}

// rollDir returns the absolute directory for a roll's items.
func rollDir(code, rollID string) string {
	return filepath.Join(MediaRoot, "rooms", code, rollID)
}

// findOrCreateCurrentRoll returns the doc for this room's current ISO
// week, creating it on first upload of the week.
func findOrCreateCurrentRoll(ctx context.Context, code string) (*models.Film, error) {
	now := time.Now().UTC()
	period := isoWeekPeriod(now)
	developAt := developAtForPeriod(now)

	var roll models.Film
	err := db.Col("films").FindOne(ctx, bson.M{"roomId": code, "period": period}).Decode(&roll)
	if err == nil {
		return &roll, nil
	}
	if err != mongo.ErrNoDocuments {
		return nil, err
	}
	roll = models.Film{
		RoomID:    code,
		Period:    period,
		DevelopAt: developAt,
		Items:     []models.FilmItem{},
		CreatedAt: now,
	}
	res, err := db.Col("films").InsertOne(ctx, roll)
	if err != nil {
		return nil, err
	}
	roll.ID = res.InsertedID.(bson.ObjectID)
	return &roll, nil
}

// ListFilms returns all rolls for a room. Items are masked for non-owner
// when the roll hasn't developed yet — both partners can see counts but
// not each other's contents until reveal.
func ListFilms(w http.ResponseWriter, r *http.Request) {
	code := strings.ToUpper(chi.URLParam(r, "code"))
	uid := userID(r)
	now := time.Now().UTC()

	ctx, cancel := context.WithTimeout(r.Context(), 5*time.Second)
	defer cancel()

	cursor, err := db.Col("films").Find(ctx,
		bson.M{"roomId": code},
		options.Find().SetSort(bson.M{"developAt": -1}),
	)
	if err != nil {
		http.Error(w, "db error", http.StatusInternalServerError)
		return
	}
	var rolls []models.Film
	cursor.All(ctx, &rolls)

	type rollOut struct {
		ID         string             `json:"id"`
		Period     string             `json:"period"`
		DevelopAt  time.Time          `json:"developAt"`
		PurgeAt    time.Time          `json:"purgeAt"`
		Developed  bool               `json:"developed"`
		Items      []models.FilmItem  `json:"items"`
		PartnerHas int                `json:"partnerHas"`
	}
	out := make([]rollOut, 0, len(rolls))
	for _, roll := range rolls {
		developed := !now.Before(roll.DevelopAt)
		visible := make([]models.FilmItem, 0, len(roll.Items))
		partnerHas := 0
		for _, it := range roll.Items {
			if developed || it.UserID == uid {
				visible = append(visible, it)
			} else {
				partnerHas++
			}
		}
		out = append(out, rollOut{
			ID:         roll.ID.Hex(),
			Period:     roll.Period,
			DevelopAt:  roll.DevelopAt,
			PurgeAt:    roll.DevelopAt.Add(purgeAfterDevelop),
			Developed:  developed,
			Items:      visible,
			PartnerHas: partnerHas,
		})
	}
	respond(w, http.StatusOK, out)
}

// UploadFilmItem accepts a multipart form with one "file" field. Photos
// must be < maxPhotoBytes, videos < maxVideoBytes. Writes to disk under
// MediaRoot, then appends a FilmItem to the current week's roll.
func UploadFilmItem(w http.ResponseWriter, r *http.Request) {
	code := strings.ToUpper(chi.URLParam(r, "code"))
	uid := userID(r)

	if err := r.ParseMultipartForm(maxVideoBytes + 1024*1024); err != nil {
		http.Error(w, "upload too large", http.StatusBadRequest)
		return
	}
	file, header, err := r.FormFile("file")
	if err != nil {
		http.Error(w, "file required", http.StatusBadRequest)
		return
	}
	defer file.Close()

	mimeType := header.Header.Get("Content-Type")
	kind := ""
	switch {
	case strings.HasPrefix(mimeType, "image/"):
		kind = "photo"
		if header.Size > maxPhotoBytes {
			http.Error(w, "photo too large (max 5 MB)", http.StatusRequestEntityTooLarge)
			return
		}
	case strings.HasPrefix(mimeType, "video/"):
		kind = "video"
		if header.Size > maxVideoBytes {
			http.Error(w, "video too large (max 50 MB)", http.StatusRequestEntityTooLarge)
			return
		}
	default:
		http.Error(w, "unsupported file type", http.StatusBadRequest)
		return
	}

	ctx, cancel := context.WithTimeout(r.Context(), 30*time.Second)
	defer cancel()

	roll, err := findOrCreateCurrentRoll(ctx, code)
	if err != nil {
		http.Error(w, "db error", http.StatusInternalServerError)
		return
	}
	if len(roll.Items) >= maxItemsPerRoll {
		http.Error(w, "this week's roll is full", http.StatusForbidden)
		return
	}

	rollIDHex := roll.ID.Hex()
	dir := rollDir(code, rollIDHex)
	if err := os.MkdirAll(dir, 0o755); err != nil {
		http.Error(w, "fs error", http.StatusInternalServerError)
		return
	}

	itemID := randomID(8)
	ext := safeExt(header.Filename, mimeType)
	filename := itemID + ext
	dst, err := os.Create(filepath.Join(dir, filename))
	if err != nil {
		http.Error(w, "fs write error", http.StatusInternalServerError)
		return
	}
	defer dst.Close()
	written, err := io.Copy(dst, file)
	if err != nil {
		os.Remove(dst.Name())
		http.Error(w, "fs write error", http.StatusInternalServerError)
		return
	}

	item := models.FilmItem{
		ID:        itemID,
		UserID:    uid,
		Kind:      kind,
		Filename:  filename,
		MimeType:  mimeType,
		Size:      written,
		CreatedAt: time.Now(),
	}
	db.Col("films").UpdateOne(ctx,
		bson.M{"_id": roll.ID},
		bson.M{"$push": bson.M{"items": item}},
	)

	respond(w, http.StatusCreated, item)
}

// safeExt picks a file extension we trust — from the mime type when
// possible, falling back to the original filename's extension.
func safeExt(filename, mimeType string) string {
	if exts, _ := mime.ExtensionsByType(mimeType); len(exts) > 0 {
		return exts[0]
	}
	if e := filepath.Ext(filename); e != "" {
		return e
	}
	return ".bin"
}

// ServeFilmItem streams a stored file. RequireMember has already
// validated the caller; we just resolve the path and let http.ServeFile
// handle Range requests + content-type detection.
func ServeFilmItem(w http.ResponseWriter, r *http.Request) {
	code := strings.ToUpper(chi.URLParam(r, "code"))
	rollID := chi.URLParam(r, "rollId")
	filename := chi.URLParam(r, "filename")

	// Path-traversal defence: reject anything with separators or "..".
	if strings.ContainsAny(rollID, "/\\.") || strings.ContainsAny(filename, "/\\") || strings.Contains(filename, "..") {
		http.NotFound(w, r)
		return
	}

	path := filepath.Join(rollDir(code, rollID), filename)
	// Cache for an hour; files are immutable once uploaded.
	w.Header().Set("Cache-Control", "private, max-age=3600")
	http.ServeFile(w, r, path)
}

// SweepFadedFilms runs in cleanup.go's daily worker. Removes rolls
// whose 7-day post-develop window has passed.
func SweepFadedFilms(ctx context.Context) (int64, error) {
	now := time.Now().UTC()
	cutoff := now.Add(-purgeAfterDevelop)

	cursor, err := db.Col("films").Find(ctx, bson.M{"developAt": bson.M{"$lt": cutoff}})
	if err != nil {
		return 0, err
	}
	var rolls []models.Film
	if err := cursor.All(ctx, &rolls); err != nil {
		return 0, err
	}
	for _, roll := range rolls {
		_ = os.RemoveAll(rollDir(roll.RoomID, roll.ID.Hex()))
		db.Col("films").DeleteOne(ctx, bson.M{"_id": roll.ID})
	}
	return int64(len(rolls)), nil
}

// PurgeRoomMedia removes all on-disk media for a room — called from the
// inactive-room sweep and from manual DeleteRoom.
func PurgeRoomMedia(code string) {
	_ = os.RemoveAll(filepath.Join(MediaRoot, "rooms", code))
}
