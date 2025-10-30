#!/bin/bash

echo "=== Port Detection Debug ==="
echo ""

# Get terminal PIDs from config
echo "1. Terminal PIDs from active worktree:"
TERMINAL_PIDS=$(ps aux | grep -E "node-pty|ptyProcess" | grep -v grep | awk '{print $2}')
echo "$TERMINAL_PIDS"
echo ""

# Check for child processes
echo "2. Child processes of terminals:"
for pid in $TERMINAL_PIDS; do
    echo "Terminal PID $pid children:"
    pgrep -P $pid || echo "  (no children)"
done
echo ""

# Check what's listening on ports 3000-3010
echo "3. Processes listening on ports 3000-3010:"
for port in {3000..3010}; do
    listener=$(lsof -nP -iTCP:$port -sTCP:LISTEN 2>/dev/null | tail -n +2)
    if [ ! -z "$listener" ]; then
        echo "Port $port:"
        echo "$listener"
    fi
done
echo ""

# Try the same lsof command the app uses
echo "4. Testing lsof command for each PID:"
for pid in $TERMINAL_PIDS; do
    echo "PID $pid:"
    children=$(pgrep -P $pid || echo "")
    all_pids="$pid $children"

    for check_pid in $all_pids; do
        ports=$(lsof -Pan -p $check_pid -i4TCP -sTCP:LISTEN 2>/dev/null | awk 'NR>1 {print $9}' | sed 's/.*://' || echo "")
        if [ ! -z "$ports" ]; then
            echo "  PID $check_pid listening on: $ports"
        fi
    done
done
echo ""

echo "5. Check config for detected ports:"
cat ~/.superset/config.json | jq '.workspaces[] | select(.name == "website") | .worktrees[] | select(.detectedPorts) | {branch, detectedPorts}'
echo ""

echo "=== Next Steps ==="
echo "1. If no ports detected above, the dev servers may not be running"
echo "2. Wait 2-4 seconds for the next polling cycle"
echo "3. Check Electron console for: [PortDetector] Detected port"
echo "4. If still no detection, check if dev servers are child processes of the terminal PIDs"
