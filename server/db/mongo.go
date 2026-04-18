package db

import (
	"context"
	"log"

	"go.mongodb.org/mongo-driver/v2/mongo"
	"go.mongodb.org/mongo-driver/v2/mongo/options"
)

var Client *mongo.Client
var DB *mongo.Database

func Connect(ctx context.Context, uri, dbName string) error {
	if uri == "" {
		uri = "mongodb://localhost:27017"
	}
	if dbName == "" {
		dbName = "ldr"
	}
	client, err := mongo.Connect(options.Client().ApplyURI(uri))
	if err != nil {
		return err
	}
	if err = client.Ping(ctx, nil); err != nil {
		return err
	}
	Client = client
	DB = client.Database(dbName)
	log.Printf("MongoDB connected (db: %s)", dbName)
	return nil
}

func Col(name string) *mongo.Collection {
	return DB.Collection(name)
}
