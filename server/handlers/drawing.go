package handlers

import (
	"context"
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

// Cap how many strokes we keep so a room can't grow unbounded.
const maxStrokes = 2000

// Cap points per stroke so a payload can't grow unbounded.
const maxPointsPerStroke = 4000

func GetDrawing(w http.ResponseWriter, r *http.Request) {
	code := strings.ToUpper(chi.URLParam(r, "code"))

	ctx, cancel := context.WithTimeout(r.Context(), 5*time.Second)
	defer cancel()

	var d models.Drawing
	err := db.Col("drawing").FindOne(ctx, bson.M{"roomId": code}).Decode(&d)
	if err == mongo.ErrNoDocuments {
		respond(w, http.StatusOK, models.Drawing{RoomID: code, Strokes: []models.Stroke{}})
		return
	}
	if err != nil {
		http.Error(w, "db error", http.StatusInternalServerError)
		return
	}
	if d.Strokes == nil {
		d.Strokes = []models.Stroke{}
	}
	respond(w, http.StatusOK, d)
}

func ClearDrawing(w http.ResponseWriter, r *http.Request) {
	code := strings.ToUpper(chi.URLParam(r, "code"))

	ctx, cancel := context.WithTimeout(r.Context(), 5*time.Second)
	defer cancel()

	db.Col("drawing").UpdateOne(ctx,
		bson.M{"roomId": code},
		bson.M{"$set": bson.M{"strokes": []models.Stroke{}, "updatedAt": time.Now()}},
		options.UpdateOne().SetUpsert(true),
	)
	w.WriteHeader(http.StatusNoContent)
}

// AppendStroke is called from the WS handler when a client finishes a stroke.
// Async — caller does not wait.
func AppendStroke(roomID string, s models.Stroke) {
	if len(s.Points) == 0 {
		return
	}
	if len(s.Points) > maxPointsPerStroke {
		s.Points = s.Points[:maxPointsPerStroke]
	}
	if s.At.IsZero() {
		s.At = time.Now()
	}
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	db.Col("drawing").UpdateOne(ctx,
		bson.M{"roomId": roomID},
		bson.M{
			"$push": bson.M{"strokes": bson.M{
				"$each":  []models.Stroke{s},
				"$slice": -maxStrokes,
			}},
			"$set": bson.M{"updatedAt": time.Now()},
		},
		options.UpdateOne().SetUpsert(true),
	)
}

func ClearStrokes(roomID string) {
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	db.Col("drawing").UpdateOne(ctx,
		bson.M{"roomId": roomID},
		bson.M{"$set": bson.M{"strokes": []models.Stroke{}, "updatedAt": time.Now()}},
		options.UpdateOne().SetUpsert(true),
	)
}
