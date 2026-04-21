package models

import "go.mongodb.org/mongo-driver/v2/bson"

type WatchParty struct {
	ID      bson.ObjectID `bson:"_id,omitempty" json:"id"`
	RoomID  string        `bson:"roomId" json:"roomId"`
	VideoID string        `bson:"videoId" json:"videoId"`
	Title   string        `bson:"title" json:"title"`
	Queue   []QueueItem   `bson:"queue,omitempty" json:"queue,omitempty"`
}

type QueueItem struct {
	VideoID string `bson:"videoId" json:"videoId"`
	Title   string `bson:"title,omitempty" json:"title,omitempty"`
	AddedBy string `bson:"addedBy" json:"addedBy"`
}

type ChatMessage struct {
	ID        bson.ObjectID `bson:"_id,omitempty" json:"id"`
	RoomID    string        `bson:"roomId" json:"roomId"`
	UserID    string        `bson:"userId" json:"userId"`
	Name      string        `bson:"name" json:"name"`
	Text      string        `bson:"text" json:"text"`
	CreatedAt int64         `bson:"createdAt" json:"createdAt"` // unix ms
}
