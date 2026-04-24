package models

import (
	"time"

	"go.mongodb.org/mongo-driver/v2/bson"
)

// Film is one weekly shared roll. Items pile up locked during the week,
// reveal at developAt, and fade 7 days after that. One doc per (room,
// period). Period uses ISO week format like "2026-W17".
type Film struct {
	ID        bson.ObjectID `bson:"_id,omitempty" json:"id"`
	RoomID    string        `bson:"roomId" json:"roomId"`
	Period    string        `bson:"period" json:"period"`
	DevelopAt time.Time     `bson:"developAt" json:"developAt"`
	Items     []FilmItem    `bson:"items" json:"items"`
	CreatedAt time.Time     `bson:"createdAt" json:"createdAt"`
}

type FilmItem struct {
	ID        string    `bson:"id" json:"id"`
	UserID    string    `bson:"userId" json:"userId"`
	Kind      string    `bson:"kind" json:"kind"`
	Filename  string    `bson:"filename" json:"filename"`
	MimeType  string    `bson:"mimeType" json:"mimeType"`
	Size      int64     `bson:"size" json:"size"`
	CreatedAt time.Time `bson:"createdAt" json:"createdAt"`
}
