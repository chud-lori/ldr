package models

import (
	"time"

	"go.mongodb.org/mongo-driver/v2/bson"
)

// Mood is the "today's mood" check-in shown on the Dashboard. One doc
// per (room, user) — upserted whenever the user changes their mood.
// Separate from the journal's mood (which is tied to a daily entry and
// hidden until both have written) because this one is meant to be
// immediate and always visible to the partner.
type Mood struct {
	ID        bson.ObjectID `bson:"_id,omitempty" json:"id"`
	RoomID    string        `bson:"roomId" json:"roomId"`
	UserID    string        `bson:"userId" json:"userId"`
	Emoji     string        `bson:"emoji" json:"emoji"`
	Note      string        `bson:"note,omitempty" json:"note,omitempty"`
	UpdatedAt time.Time     `bson:"updatedAt" json:"updatedAt"`
}
