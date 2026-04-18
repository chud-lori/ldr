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

func GetTrivia(w http.ResponseWriter, r *http.Request) {
	code := strings.ToUpper(chi.URLParam(r, "code"))
	uid := userID(r)

	ctx, cancel := context.WithTimeout(r.Context(), 5*time.Second)
	defer cancel()

	cursor, _ := db.Col("trivia").Find(ctx,
		bson.M{"roomId": code},
		options.Find().SetSort(bson.M{"createdAt": -1}),
	)
	var questions []models.TriviaQuestion
	cursor.All(ctx, &questions)

	// Mask the correct answer for questions the requester didn't create.
	for i := range questions {
		if questions[i].UserID != uid {
			questions[i].Answer = ""
		}
	}

	respond(w, http.StatusOK, questions)
}

func AddTrivia(w http.ResponseWriter, r *http.Request) {
	code := strings.ToUpper(chi.URLParam(r, "code"))
	uid := userID(r)

	var body struct {
		Name     string `json:"name"`
		Question string `json:"question"`
		Answer   string `json:"answer"`
	}
	json.NewDecoder(r.Body).Decode(&body)

	q := models.TriviaQuestion{
		RoomID:    code,
		UserID:    uid,
		Name:      body.Name,
		Question:  body.Question,
		Answer:    body.Answer,
		Attempts:  []models.TriviaAttempt{},
		CreatedAt: time.Now(),
	}

	ctx, cancel := context.WithTimeout(r.Context(), 5*time.Second)
	defer cancel()

	res, _ := db.Col("trivia").InsertOne(ctx, q)
	q.ID = res.InsertedID.(bson.ObjectID)

	respond(w, http.StatusCreated, q)
}

func AnswerTrivia(w http.ResponseWriter, r *http.Request) {
	qid, _ := bson.ObjectIDFromHex(chi.URLParam(r, "id"))
	uid := userID(r)

	var body struct {
		Name   string `json:"name"`
		Answer string `json:"answer"`
	}
	json.NewDecoder(r.Body).Decode(&body)

	ctx, cancel := context.WithTimeout(r.Context(), 5*time.Second)
	defer cancel()

	// Get the question to check answer
	var q models.TriviaQuestion
	if err := db.Col("trivia").FindOne(ctx, bson.M{"_id": qid}).Decode(&q); err != nil {
		http.Error(w, "not found", http.StatusNotFound)
		return
	}

	// Cannot answer your own question
	if q.UserID == uid {
		http.Error(w, "cannot answer your own question", http.StatusForbidden)
		return
	}

	correct := strings.EqualFold(strings.TrimSpace(body.Answer), strings.TrimSpace(q.Answer))

	var correctAnswer string
	if !correct {
		correctAnswer = q.Answer
	}

	attempt := models.TriviaAttempt{
		UserID:        uid,
		Name:          body.Name,
		Answer:        body.Answer,
		Correct:       correct,
		CorrectAnswer: correctAnswer,
		CreatedAt:     time.Now(),
	}

	// Remove any previous attempt by this user so they can re-answer.
	db.Col("trivia").UpdateOne(ctx,
		bson.M{"_id": qid},
		bson.M{"$pull": bson.M{"attempts": bson.M{"userId": uid}}},
	)
	db.Col("trivia").UpdateOne(ctx,
		bson.M{"_id": qid},
		bson.M{"$push": bson.M{"attempts": attempt}},
	)

	respond(w, http.StatusOK, map[string]any{"correct": correct, "correctAnswer": q.Answer})
}

func DeleteTrivia(w http.ResponseWriter, r *http.Request) {
	id, _ := bson.ObjectIDFromHex(chi.URLParam(r, "id"))
	uid := userID(r)

	ctx, cancel := context.WithTimeout(r.Context(), 5*time.Second)
	defer cancel()

	db.Col("trivia").DeleteOne(ctx, bson.M{"_id": id, "userId": uid})
	w.WriteHeader(http.StatusNoContent)
}
