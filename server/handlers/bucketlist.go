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

func GetBucketList(w http.ResponseWriter, r *http.Request) {
	code := strings.ToUpper(chi.URLParam(r, "code"))
	uid := userID(r)

	ctx, cancel := context.WithTimeout(r.Context(), 5*time.Second)
	defer cancel()

	cursor, _ := db.Col("bucketlist").Find(ctx,
		bson.M{"roomId": code},
		options.Find().SetSort(bson.M{"createdAt": -1}),
	)
	var items []models.BucketItem
	cursor.All(ctx, &items)

	now := time.Now()
	for i := range items {
		// Hide surprise item content from non-creator until reveal date
		if items[i].Surprise && items[i].UserID != uid {
			if items[i].RevealAt != nil && items[i].RevealAt.After(now) {
				items[i].Text = ""
			}
		}
	}

	respond(w, http.StatusOK, items)
}

func AddBucketItem(w http.ResponseWriter, r *http.Request) {
	code := strings.ToUpper(chi.URLParam(r, "code"))
	uid := userID(r)

	var body struct {
		Name     string     `json:"name"`
		Text     string     `json:"text"`
		Surprise bool       `json:"surprise"`
		RevealAt *time.Time `json:"revealAt,omitempty"`
	}
	json.NewDecoder(r.Body).Decode(&body)

	item := models.BucketItem{
		RoomID:    code,
		UserID:    uid,
		Name:      body.Name,
		Text:      body.Text,
		Surprise:  body.Surprise,
		RevealAt:  body.RevealAt,
		CreatedAt: time.Now(),
	}

	ctx, cancel := context.WithTimeout(r.Context(), 5*time.Second)
	defer cancel()

	res, _ := db.Col("bucketlist").InsertOne(ctx, item)
	item.ID = res.InsertedID.(bson.ObjectID)

	respond(w, http.StatusCreated, item)
}

func UpdateBucketItem(w http.ResponseWriter, r *http.Request) {
	code := strings.ToUpper(chi.URLParam(r, "code"))
	id, _ := bson.ObjectIDFromHex(chi.URLParam(r, "id"))
	uid := userID(r)

	var body struct {
		Done bool   `json:"done"`
		Text string `json:"text"`
	}
	json.NewDecoder(r.Body).Decode(&body)

	ctx, cancel := context.WithTimeout(r.Context(), 5*time.Second)
	defer cancel()

	set := bson.M{"done": body.Done, "text": body.Text}
	unset := bson.M{}
	if body.Done {
		now := time.Now()
		set["doneAt"] = now
	} else {
		unset["doneAt"] = ""
	}
	update := bson.M{"$set": set}
	if len(unset) > 0 {
		update["$unset"] = unset
	}

	filter := bson.M{"_id": id, "roomId": code, "userId": uid}
	db.Col("bucketlist").UpdateOne(ctx, filter, update)
	w.WriteHeader(http.StatusNoContent)
}

func DeleteBucketItem(w http.ResponseWriter, r *http.Request) {
	code := strings.ToUpper(chi.URLParam(r, "code"))
	id, _ := bson.ObjectIDFromHex(chi.URLParam(r, "id"))
	uid := userID(r)

	ctx, cancel := context.WithTimeout(r.Context(), 5*time.Second)
	defer cancel()

	db.Col("bucketlist").DeleteOne(ctx, bson.M{"_id": id, "roomId": code, "userId": uid})
	w.WriteHeader(http.StatusNoContent)
}
