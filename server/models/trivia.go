package models

import (
	"time"

	"go.mongodb.org/mongo-driver/v2/bson"
)

type TriviaQuestion struct {
	ID        bson.ObjectID  `bson:"_id,omitempty" json:"id"`
	RoomID    string         `bson:"roomId" json:"roomId"`
	UserID    string         `bson:"userId" json:"userId"`
	Name      string         `bson:"name" json:"name"`
	Question  string         `bson:"question" json:"question"`
	Answer    string         `bson:"answer" json:"answer"`
	Attempts  []TriviaAttempt `bson:"attempts" json:"attempts"`
	CreatedAt time.Time      `bson:"createdAt" json:"createdAt"`
}

type TriviaAttempt struct {
	UserID    string    `bson:"userId" json:"userId"`
	Name      string    `bson:"name" json:"name"`
	Answer    string    `bson:"answer" json:"answer"`
	Correct   bool      `bson:"correct" json:"correct"`
	CreatedAt time.Time `bson:"createdAt" json:"createdAt"`
}
