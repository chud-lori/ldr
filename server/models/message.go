package models

import (
	"time"

	"go.mongodb.org/mongo-driver/v2/bson"
)

// Message is an async "leave a note" — a single text (with optional
// picture) delivered to the partner whenever they next open the app.
// Ephemeral: the row + any attached image file are deleted the moment
// the recipient marks it read. Distinct from chat (which is persistent,
// in-Watch-Party, conversational).
type Message struct {
	ID          bson.ObjectID `bson:"_id,omitempty" json:"id"`
	RoomID      string        `bson:"roomId" json:"roomId"`
	SenderID    string        `bson:"senderId" json:"senderId"`
	SenderName  string        `bson:"senderName" json:"senderName"`
	RecipientID string        `bson:"recipientId" json:"recipientId"`
	Text        string        `bson:"text" json:"text"`
	// Optional picture — stored under MEDIA_ROOT/rooms/{code}/messages/.
	// Empty for text-only notes.
	ImageFilename string    `bson:"imageFilename,omitempty" json:"imageFilename,omitempty"`
	ImageMime     string    `bson:"imageMime,omitempty" json:"imageMime,omitempty"`
	CreatedAt     time.Time `bson:"createdAt" json:"createdAt"`
}
