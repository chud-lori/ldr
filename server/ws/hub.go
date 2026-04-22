package ws

import (
	"encoding/json"
	"log"
	"sync"
)

type Client struct {
	ID       string
	Name     string
	Timezone string
	RoomID   string
	Send     chan []byte
}

type Message struct {
	Type    string          `json:"type"`
	UserID  string          `json:"userId"`
	Name    string          `json:"name,omitempty"`
	Payload json.RawMessage `json:"payload"`
}

type RoomMessage struct {
	RoomID string
	Data   []byte
	Sender *Client
}

type regRequest struct {
	client *Client
	done   chan struct{}
}

type unregRequest struct {
	client *Client
	done   chan struct{}
}

type Hub struct {
	rooms      map[string]map[*Client]bool
	mu         sync.RWMutex
	register   chan regRequest
	unregister chan unregRequest
	broadcast  chan *RoomMessage
}

func NewHub() *Hub {
	return &Hub{
		rooms:      make(map[string]map[*Client]bool),
		register:   make(chan regRequest, 16),
		unregister: make(chan unregRequest, 16),
		broadcast:  make(chan *RoomMessage, 128),
	}
}

func (h *Hub) Run() {
	for {
		select {
		case req := <-h.register:
			h.mu.Lock()
			if h.rooms[req.client.RoomID] == nil {
				h.rooms[req.client.RoomID] = make(map[*Client]bool)
			}
			h.rooms[req.client.RoomID][req.client] = true
			h.mu.Unlock()
			close(req.done)

		case req := <-h.unregister:
			h.mu.Lock()
			if room, ok := h.rooms[req.client.RoomID]; ok {
				if _, ok := room[req.client]; ok {
					delete(room, req.client)
					close(req.client.Send)
					if len(room) == 0 {
						delete(h.rooms, req.client.RoomID)
					}
				}
			}
			h.mu.Unlock()
			close(req.done)

		case msg := <-h.broadcast:
			h.mu.RLock()
			for c := range h.rooms[msg.RoomID] {
				if c == msg.Sender {
					continue
				}
				select {
				case c.Send <- msg.Data:
				default:
					// Receiver's send buffer is full. Drop rather than
					// block the whole hub loop, but log so mystery
					// "I didn't get X" reports are debuggable.
					log.Printf("[ws] dropped msg for client %s in room %s: send buffer full", c.ID, msg.RoomID)
				}
			}
			h.mu.RUnlock()
		}
	}
}

// Register blocks until the client is fully registered in the hub.
func (h *Hub) Register(c *Client) {
	done := make(chan struct{})
	h.register <- regRequest{client: c, done: done}
	<-done
}

// Unregister blocks until the client is removed from the hub.
func (h *Hub) Unregister(c *Client) {
	done := make(chan struct{})
	h.unregister <- unregRequest{client: c, done: done}
	<-done
}

func (h *Hub) Broadcast(roomID string, data []byte, sender *Client) {
	h.broadcast <- &RoomMessage{RoomID: roomID, Data: data, Sender: sender}
}

func (h *Hub) BroadcastAll(roomID string, data []byte) {
	h.broadcast <- &RoomMessage{RoomID: roomID, Data: data}
}

// RoomClients returns a snapshot of all clients in a room.
func (h *Hub) RoomClients(roomID string) []*Client {
	h.mu.RLock()
	defer h.mu.RUnlock()
	var out []*Client
	for c := range h.rooms[roomID] {
		out = append(out, c)
	}
	return out
}

func MarshalMsg(msgType, userID, name string, payload any) []byte {
	p, _ := json.Marshal(payload)
	data, _ := json.Marshal(Message{Type: msgType, UserID: userID, Name: name, Payload: p})
	return data
}
