package handlers

import (
	"context"
	"encoding/json"
	"math/rand"
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

func GetPuzzle(w http.ResponseWriter, r *http.Request) {
	code := strings.ToUpper(chi.URLParam(r, "code"))

	ctx, cancel := context.WithTimeout(r.Context(), 5*time.Second)
	defer cancel()

	var puzzle models.Puzzle
	err := db.Col("puzzle").FindOne(ctx, bson.M{"roomId": code}).Decode(&puzzle)
	if err == mongo.ErrNoDocuments {
		respond(w, http.StatusOK, nil)
		return
	}
	respond(w, http.StatusOK, puzzle)
}

func CreatePuzzle(w http.ResponseWriter, r *http.Request) {
	code := strings.ToUpper(chi.URLParam(r, "code"))

	var body struct {
		ImageURL string `json:"imageUrl"`
		GridSize int    `json:"gridSize"`
	}
	json.NewDecoder(r.Body).Decode(&body)

	if body.GridSize < 2 || body.GridSize > 6 {
		body.GridSize = 4
	}

	total := body.GridSize * body.GridSize
	indices := rand.Perm(total)

	pieces := make([]models.PuzzlePiece, total)
	for i := 0; i < total; i++ {
		correctX := i % body.GridSize
		correctY := i / body.GridSize
		currentIdx := indices[i]
		pieces[i] = models.PuzzlePiece{
			ID:       i,
			CorrectX: correctX,
			CorrectY: correctY,
			CurrentX: currentIdx % body.GridSize,
			CurrentY: currentIdx / body.GridSize,
		}
	}

	puzzle := models.Puzzle{
		RoomID:    code,
		ImageURL:  body.ImageURL,
		GridSize:  body.GridSize,
		Pieces:    pieces,
		Completed: false,
		CreatedAt: time.Now(),
	}

	ctx, cancel := context.WithTimeout(r.Context(), 5*time.Second)
	defer cancel()

	filter := bson.M{"roomId": code}
	update := bson.M{"$set": puzzle}
	opts := options.UpdateOne().SetUpsert(true)
	db.Col("puzzle").UpdateOne(ctx, filter, update, opts)

	respond(w, http.StatusCreated, puzzle)
}

func ResetPuzzle(w http.ResponseWriter, r *http.Request) {
	code := strings.ToUpper(chi.URLParam(r, "code"))

	ctx, cancel := context.WithTimeout(r.Context(), 5*time.Second)
	defer cancel()

	db.Col("puzzle").DeleteOne(ctx, bson.M{"roomId": code})
	w.WriteHeader(http.StatusNoContent)
}

func UpdatePuzzlePieces(roomID string, pieces []models.PuzzlePiece, completed bool) {
	ctx, cancel := context.WithTimeout(context.Background(), 3*time.Second)
	defer cancel()

	db.Col("puzzle").UpdateOne(ctx,
		bson.M{"roomId": roomID},
		bson.M{"$set": bson.M{"pieces": pieces, "completed": completed}},
	)
}
