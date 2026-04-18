package models

import (
	"time"

	"go.mongodb.org/mongo-driver/v2/bson"
)

type Puzzle struct {
	ID        bson.ObjectID `bson:"_id,omitempty" json:"id"`
	RoomID    string        `bson:"roomId" json:"roomId"`
	ImageURL  string        `bson:"imageUrl" json:"imageUrl"`
	GridSize  int           `bson:"gridSize" json:"gridSize"`
	Pieces    []PuzzlePiece `bson:"pieces" json:"pieces"`
	Completed bool          `bson:"completed" json:"completed"`
	CreatedAt time.Time     `bson:"createdAt" json:"createdAt"`
}

type PuzzlePiece struct {
	ID       int `bson:"id" json:"id"`
	CorrectX int `bson:"correctX" json:"correctX"`
	CorrectY int `bson:"correctY" json:"correctY"`
	CurrentX int `bson:"currentX" json:"currentX"`
	CurrentY int `bson:"currentY" json:"currentY"`
	Locked   bool `bson:"locked" json:"locked"`
}
