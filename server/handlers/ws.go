package handlers

import (
	"context"
	"encoding/json"
	"net/http"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"
	"go.mongodb.org/mongo-driver/v2/bson"
	"nhooyr.io/websocket"

	"ldr-server/db"
	"ldr-server/models"
	"ldr-server/ws"
)

func WSHandler(hub *ws.Hub) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		code := strings.ToUpper(chi.URLParam(r, "code"))
		uid := r.URL.Query().Get("userId")
		name := r.URL.Query().Get("name")

		conn, err := websocket.Accept(w, r, &websocket.AcceptOptions{
			InsecureSkipVerify: true,
		})
		if err != nil {
			return
		}

		client := &ws.Client{
			ID:     uid,
			Name:   name,
			RoomID: code,
			Send:   make(chan []byte, 64),
		}
		hub.Register(client)

		// Notify room of join
		hub.BroadcastAll(code, ws.MarshalMsg("presence:join", uid, name, map[string]string{
			"userId": uid, "name": name,
		}))

		// Send current online users to new client
		clients := hub.RoomClients(code)
		var online []map[string]string
		for _, c := range clients {
			online = append(online, map[string]string{"userId": c.ID, "name": c.Name})
		}
		conn.Write(r.Context(), websocket.MessageText,
			ws.MarshalMsg("presence:list", "", "", online))

		ctx, cancel := context.WithCancel(r.Context())
		defer cancel()

		// Writer goroutine
		go func() {
			for {
				select {
				case data, ok := <-client.Send:
					if !ok {
						conn.Close(websocket.StatusNormalClosure, "")
						return
					}
					conn.Write(ctx, websocket.MessageText, data)
				case <-ctx.Done():
					return
				}
			}
		}()

		// Reader loop
		for {
			_, data, err := conn.Read(ctx)
			if err != nil {
				break
			}

			var msg ws.Message
			if err := json.Unmarshal(data, &msg); err != nil {
				continue
			}
			msg.UserID = uid
			msg.Name = name

			outData, _ := json.Marshal(msg)

			switch {
			case strings.HasPrefix(msg.Type, "watch:") || strings.HasPrefix(msg.Type, "puzzle:"):
				hub.Broadcast(code, outData, client)

				// Persist puzzle moves
				if msg.Type == "puzzle:move" {
					go handlePuzzleMove(code, msg.Payload)
				}

			case msg.Type == "chat:send":
				var payload struct {
					Text string `json:"text"`
				}
				json.Unmarshal(msg.Payload, &payload)
				if payload.Text != "" {
					go SaveChatMessage(code, uid, name, payload.Text)
					hub.BroadcastAll(code, outData)
				}

			case msg.Type == "trivia:answer":
				hub.Broadcast(code, outData, client)
			}
		}

		hub.Unregister(client)
		hub.BroadcastAll(code, ws.MarshalMsg("presence:leave", uid, name, map[string]string{
			"userId": uid, "name": name,
		}))
	}
}

func handlePuzzleMove(roomID string, payload json.RawMessage) {
	var move struct {
		PieceID  int `json:"pieceId"`
		CurrentX int `json:"currentX"`
		CurrentY int `json:"currentY"`
	}
	if err := json.Unmarshal(payload, &move); err != nil {
		return
	}

	ctx, cancel := context.WithTimeout(context.Background(), 3*time.Second)
	defer cancel()

	var puzzle models.Puzzle
	if err := db.Col("puzzle").FindOne(ctx, bson.M{"roomId": roomID}).Decode(&puzzle); err != nil {
		return
	}

	for i := range puzzle.Pieces {
		if puzzle.Pieces[i].ID == move.PieceID {
			puzzle.Pieces[i].CurrentX = move.CurrentX
			puzzle.Pieces[i].CurrentY = move.CurrentY
			break
		}
	}

	// Check completion
	completed := true
	for _, p := range puzzle.Pieces {
		if p.CurrentX != p.CorrectX || p.CurrentY != p.CorrectY {
			completed = false
			break
		}
	}

	UpdatePuzzlePieces(roomID, puzzle.Pieces, completed)
}
