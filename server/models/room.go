package models

import (
	"time"

	"go.mongodb.org/mongo-driver/v2/bson"
)

type Room struct {
	ID         bson.ObjectID `bson:"_id,omitempty" json:"id"`
	Code       string        `bson:"code" json:"code"`
	Name       string        `bson:"name" json:"name"`
	Members    []Member      `bson:"members" json:"members"`
	NextMeetup *time.Time    `bson:"nextMeetup,omitempty" json:"nextMeetup,omitempty"`
	Theme      string        `bson:"theme,omitempty" json:"theme,omitempty"`
	CreatedAt  time.Time     `bson:"createdAt" json:"createdAt"`
}

type Member struct {
	UserID string `bson:"userId" json:"userId"`
	Name   string `bson:"name" json:"name"`
}
