#!/bin/bash
# Helper script to run multiple Electron dev instances with different ports and data directories

# Usage:
#   ./dev-instance.sh [instance-name] [port]
#   ./dev-instance.sh instance1 4927
#   ./dev-instance.sh instance2 4928

INSTANCE_NAME=${1:-default}
PORT=${2:-4927}
USER_DATA_DIR="$HOME/.superset-dev-$INSTANCE_NAME"

echo "🚀 Starting Superset instance: $INSTANCE_NAME"
echo "   Port: $PORT"
echo "   User Data: $USER_DATA_DIR"
echo ""

export VITE_DEV_SERVER_PORT=$PORT

# Pass user data directory to electron
bun dev -- --user-data-dir="$USER_DATA_DIR"
