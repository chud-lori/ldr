package models

import (
	"time"

	"go.mongodb.org/mongo-driver/v2/bson"
)

type Stroke struct {
	UserID string       `bson:"userId" json:"userId"`
	Color  string       `bson:"color" json:"color"`
	Width  float64      `bson:"width" json:"width"`
	Points [][2]float64 `bson:"points" json:"points"` // normalized 0..1 (x,y) pairs
	At     time.Time    `bson:"at" json:"at"`
}

type Drawing struct {
	ID        bson.ObjectID `bson:"_id,omitempty" json:"id"`
	RoomID    string        `bson:"roomId" json:"roomId"`
	Strokes   []Stroke      `bson:"strokes" json:"strokes"`
	UpdatedAt time.Time     `bson:"updatedAt" json:"updatedAt"`
}
