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
	// Reactions and cheers from the partner after both have written that
	// day. Owner-side display only — the server tags them on read.
	Reactions []JournalReaction `bson:"reactions,omitempty" json:"reactions,omitempty"`
	Cheers    []JournalCheer    `bson:"cheers,omitempty" json:"cheers,omitempty"`
	CreatedAt time.Time     `bson:"createdAt" json:"createdAt"`
	UpdatedAt time.Time     `bson:"updatedAt" json:"updatedAt"`
}

type JournalReaction struct {
	UserID string    `bson:"userId" json:"userId"`
	Emoji  string    `bson:"emoji" json:"emoji"`
	At     time.Time `bson:"at" json:"at"`
}

type JournalCheer struct {
	UserID string    `bson:"userId" json:"userId"`
	Text   string    `bson:"text" json:"text"`
	At     time.Time `bson:"at" json:"at"`
}
