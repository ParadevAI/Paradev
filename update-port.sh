#!/bin/bash
# Script to create or increment VITE_DEV_SERVER_PORT in .env file
# Used for running multiple Electron instances with different ports

set -e

ENV_FILE=".env"
DEFAULT_PORT=4927

# Function to get next available port
get_next_port() {
    local current_port=$1
    local next_port=$((current_port + 1))
    echo $next_port
}

# Check if .env exists
if [ ! -f "$ENV_FILE" ]; then
    # Create .env from .env.example if it exists, otherwise create new
    if [ -f ".env.example" ]; then
        cp .env.example "$ENV_FILE"
        echo "✓ Created $ENV_FILE from .env.example with default port: $DEFAULT_PORT"
    else
        echo "VITE_DEV_SERVER_PORT=$DEFAULT_PORT" > "$ENV_FILE"
        echo "✓ Created $ENV_FILE with default port: $DEFAULT_PORT"
    fi
else
    # .env exists, check if VITE_DEV_SERVER_PORT is set
    if grep -q "^VITE_DEV_SERVER_PORT=" "$ENV_FILE"; then
        # Extract current port
        current_port=$(grep "^VITE_DEV_SERVER_PORT=" "$ENV_FILE" | cut -d'=' -f2)
        next_port=$(get_next_port $current_port)

        # Update the port
        if [[ "$OSTYPE" == "darwin"* ]]; then
            # macOS
            sed -i '' "s/^VITE_DEV_SERVER_PORT=.*/VITE_DEV_SERVER_PORT=$next_port/" "$ENV_FILE"
        else
            # Linux
            sed -i "s/^VITE_DEV_SERVER_PORT=.*/VITE_DEV_SERVER_PORT=$next_port/" "$ENV_FILE"
        fi

        echo "✓ Updated port: $current_port → $next_port"
    else
        # VITE_DEV_SERVER_PORT not in .env, append it
        echo "" >> "$ENV_FILE"
        echo "VITE_DEV_SERVER_PORT=$DEFAULT_PORT" >> "$ENV_FILE"
        echo "✓ Added VITE_DEV_SERVER_PORT=$DEFAULT_PORT to $ENV_FILE"
    fi
fi
