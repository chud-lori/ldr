package models

import (
	"time"

	"go.mongodb.org/mongo-driver/v2/bson"
)

type Room struct {
	ID           bson.ObjectID `bson:"_id,omitempty" json:"id"`
	Code         string        `bson:"code" json:"code"`
	Name         string        `bson:"name" json:"name"`
	Members      []Member      `bson:"members" json:"members"`
	NextMeetup   *time.Time    `bson:"nextMeetup,omitempty" json:"nextMeetup,omitempty"`
	Theme        string        `bson:"theme,omitempty" json:"theme,omitempty"`
	LastActiveAt *time.Time    `bson:"lastActiveAt,omitempty" json:"lastActiveAt,omitempty"`
	CreatedAt    time.Time     `bson:"createdAt" json:"createdAt"`
}

type Member struct {
	UserID   string `bson:"userId" json:"userId"`
	Name     string `bson:"name" json:"name"`
	Timezone string `bson:"timezone,omitempty" json:"timezone,omitempty"`
	// Location is the user-set display label shown next to their time on
	// the Dashboard. Empty → client falls back to the IANA-derived city.
	Location string `bson:"location,omitempty" json:"location,omitempty"`
	// LastSeenAt is touched on WS disconnect (not on ping). Powers both
	// the "last here 2h ago" partner-offline label and the "Since you
	// were away" activity feed cutoff. Anchoring to disconnect-only means
	// the value represents the *end of the previous session* throughout
	// the current one — exactly what the activity query needs.
	LastSeenAt *time.Time `bson:"lastSeenAt,omitempty" json:"lastSeenAt,omitempty"`
	// HideLastSeen lets a member opt out — when true, their LastSeenAt is
	// stripped before responses go to the partner.
	HideLastSeen bool `bson:"hideLastSeen,omitempty" json:"hideLastSeen,omitempty"`
}
