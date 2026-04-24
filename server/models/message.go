package models

import (
	"time"

	"go.mongodb.org/mongo-driver/v2/bson"
)

// Message is an async "leave a note" — a single text delivered to the
// partner whenever they next open the app. Ephemeral: the row is deleted
// the moment the recipient marks it read. Distinct from chat (which is
// persistent, in-Watch-Party, conversational).
type Message struct {
	ID          bson.ObjectID `bson:"_id,omitempty" json:"id"`
	RoomID      string        `bson:"roomId" json:"roomId"`
	SenderID    string        `bson:"senderId" json:"senderId"`
	SenderName  string        `bson:"senderName" json:"senderName"`
	RecipientID string        `bson:"recipientId" json:"recipientId"`
	Text        string        `bson:"text" json:"text"`
	CreatedAt   time.Time     `bson:"createdAt" json:"createdAt"`
}
