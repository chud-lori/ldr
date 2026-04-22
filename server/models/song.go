package models

import (
	"time"

	"go.mongodb.org/mongo-driver/v2/bson"
)

// Song is an ephemeral music-letter from one partner to the other.
// Status transitions: unheard → (saved | dismissed). A saved song is
// kept in the receiver's Saved tab; a dismissed song is hidden from the
// receiver but stays visible in the sender's Sent list so they can see
// "heard it" feedback.
type Song struct {
	ID          bson.ObjectID `bson:"_id,omitempty" json:"id"`
	RoomID      string        `bson:"roomId" json:"roomId"`
	SenderID    string        `bson:"senderId" json:"senderId"`
	SenderName  string        `bson:"senderName" json:"senderName"`
	RecipientID string        `bson:"recipientId" json:"recipientId"`
	Provider    string        `bson:"provider" json:"provider"`
	TrackID     string        `bson:"trackId" json:"trackId"`
	URL         string        `bson:"url" json:"url"`
	Title       string        `bson:"title" json:"title"`
	Artist      string        `bson:"artist" json:"artist"`
	Thumb       string        `bson:"thumb" json:"thumb"`
	Message     string        `bson:"message" json:"message"`
	Status      string        `bson:"status" json:"status"`
	CreatedAt   time.Time     `bson:"createdAt" json:"createdAt"`
	HeardAt     *time.Time    `bson:"heardAt,omitempty" json:"heardAt,omitempty"`
	SavedAt     *time.Time    `bson:"savedAt,omitempty" json:"savedAt,omitempty"`
}
