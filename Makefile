.PHONY: help dev server client install build test clean

# Default target: show what's available
help:
	@echo "LDR Together — local development"
	@echo ""
	@echo "  make dev       Run server + client in one terminal (Ctrl+C stops both)"
	@echo "  make server    Run the Go server only  (:8080)"
	@echo "  make client    Run the Vite dev server only (:5173)"
	@echo "  make install   Install client deps + download Go modules"
	@echo "  make build     Production build of the client"
	@echo "  make test      Run the Playwright suite (requires make dev in another term)"
	@echo ""
	@echo "  First time?  make install  →  make dev  →  open http://localhost:5173"

install:
	cd client && bun install
	cd server && go mod download

server:
	cd server && go run .

client:
	cd client && bun run dev

# Run both dev servers in parallel. The trap ensures Ctrl+C kills both.
# Output is prefixed so you can tell which log line came from which side.
dev:
	@echo "→ starting server + client   (Ctrl+C to stop both)"
	@trap 'kill 0' INT TERM EXIT; \
		( cd server && go run . 2>&1 | sed -u 's/^/[srv] /' ) & \
		( cd client && bun run dev 2>&1 | sed -u 's/^/[web] /' ) & \
		wait

build:
	cd client && bun run build

test:
	cd client && ./node_modules/.bin/playwright test

clean:
	rm -rf client/dist client/test-results client/playwright-report
