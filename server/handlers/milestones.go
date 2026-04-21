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
)

var validKinds = map[string]bool{
	"visit":       true,
	"anniversary": true,
	"birthday":    true,
	"custom":      true,
}

func GetMilestones(w http.ResponseWriter, r *http.Request) {
	code := strings.ToUpper(chi.URLParam(r, "code"))

	ctx, cancel := context.WithTimeout(r.Context(), 5*time.Second)
	defer cancel()

	cursor, _ := db.Col("milestones").Find(ctx,
		bson.M{"roomId": code},
		options.Find().SetSort(bson.M{"date": 1}),
	)
	var items []models.Milestone
	cursor.All(ctx, &items)
	if items == nil {
		items = []models.Milestone{}
	}

	respond(w, http.StatusOK, items)
}

func AddMilestone(w http.ResponseWriter, r *http.Request) {
	code := strings.ToUpper(chi.URLParam(r, "code"))
	uid := userID(r)

	var body struct {
		Title string `json:"title"`
		Date  string `json:"date"` // RFC3339 or YYYY-MM-DD
		Kind  string `json:"kind"`
	}
	json.NewDecoder(r.Body).Decode(&body)

	body.Title = strings.TrimSpace(body.Title)
	if body.Title == "" {
		http.Error(w, "title required", http.StatusBadRequest)
		return
	}
	if !validKinds[body.Kind] {
		body.Kind = "custom"
	}

	t, err := time.Parse(time.RFC3339, body.Date)
	if err != nil {
		t, err = time.Parse("2006-01-02", body.Date)
		if err != nil {
			http.Error(w, "invalid date", http.StatusBadRequest)
			return
		}
	}

	item := models.Milestone{
		RoomID:    code,
		UserID:    uid,
		Title:     body.Title,
		Date:      t,
		Kind:      body.Kind,
		CreatedAt: time.Now(),
	}

	ctx, cancel := context.WithTimeout(r.Context(), 5*time.Second)
	defer cancel()

	res, _ := db.Col("milestones").InsertOne(ctx, item)
	item.ID = res.InsertedID.(bson.ObjectID)

	respond(w, http.StatusCreated, item)
}

func DeleteMilestone(w http.ResponseWriter, r *http.Request) {
	code := strings.ToUpper(chi.URLParam(r, "code"))
	id, _ := bson.ObjectIDFromHex(chi.URLParam(r, "id"))

	ctx, cancel := context.WithTimeout(r.Context(), 5*time.Second)
	defer cancel()

	db.Col("milestones").DeleteOne(ctx, bson.M{"_id": id, "roomId": code})
	w.WriteHeader(http.StatusNoContent)
}
