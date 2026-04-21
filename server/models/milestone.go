package models

import (
	"time"

	"go.mongodb.org/mongo-driver/v2/bson"
)

type Milestone struct {
	ID        bson.ObjectID `bson:"_id,omitempty" json:"id"`
	RoomID    string        `bson:"roomId" json:"roomId"`
	UserID    string        `bson:"userId" json:"userId"`
	Title     string        `bson:"title" json:"title"`
	Date      time.Time     `bson:"date" json:"date"`
	Kind      string        `bson:"kind" json:"kind"` // visit | anniversary | birthday | custom
	CreatedAt time.Time     `bson:"createdAt" json:"createdAt"`
}
