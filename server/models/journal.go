package models

import (
	"time"

	"go.mongodb.org/mongo-driver/v2/bson"
)

type JournalEntry struct {
	ID        bson.ObjectID `bson:"_id,omitempty" json:"id"`
	RoomID    string        `bson:"roomId" json:"roomId"`
	UserID    string        `bson:"userId" json:"userId"`
	Name      string        `bson:"name" json:"name"`
	Date      string        `bson:"date" json:"date"` // YYYY-MM-DD
	Content   string        `bson:"content" json:"content"`
	Mood      string        `bson:"mood" json:"mood"`
	CreatedAt time.Time     `bson:"createdAt" json:"createdAt"`
	UpdatedAt time.Time     `bson:"updatedAt" json:"updatedAt"`
}
