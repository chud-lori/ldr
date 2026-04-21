package models

import (
	"time"

	"go.mongodb.org/mongo-driver/v2/bson"
)

type BucketItem struct {
	ID        bson.ObjectID `bson:"_id,omitempty" json:"id"`
	RoomID    string        `bson:"roomId" json:"roomId"`
	UserID    string        `bson:"userId" json:"userId"`
	Name      string        `bson:"name" json:"name"`
	Text      string        `bson:"text" json:"text"`
	Done      bool          `bson:"done" json:"done"`
	DoneAt    *time.Time    `bson:"doneAt,omitempty" json:"doneAt,omitempty"`
	Surprise  bool          `bson:"surprise" json:"surprise"`
	RevealAt  *time.Time    `bson:"revealAt,omitempty" json:"revealAt,omitempty"`
	CreatedAt time.Time     `bson:"createdAt" json:"createdAt"`
}
