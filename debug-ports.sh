#!/bin/bash

echo "=== Port Forwarding Debug Info ==="
echo ""

echo "1. Active Workspace:"
cat ~/.superset/config.json | jq -r '.activeWorkspaceId as $id | .workspaces[] | select(.id == $id) | "Name: \(.name)\nID: \(.id)\nPorts: \(.ports // "NOT CONFIGURED")"'
echo ""

echo "2. Is proxy listening on 8080?"
lsof -nP -iTCP:8080 | grep LISTEN || echo "❌ Nothing listening on 8080"
echo ""

echo "3. What processes are listening on ports?"
lsof -nP -iTCP -sTCP:LISTEN | grep -E "node|bun|Electron" | head -20
echo ""

echo "4. Check dev server ports (3000-3010):"
for port in {3000..3010}; do
    if lsof -nP -iTCP:$port | grep -q LISTEN; then
        echo "✅ Port $port: $(lsof -nP -iTCP:$port | grep LISTEN | awk '{print $1}')"
    fi
done
echo ""

echo "5. Detected ports in config:"
cat ~/.superset/config.json | jq '.workspaces[] | select(.ports) | .worktrees[] | select(.detectedPorts) | {branch, detectedPorts}'
echo ""

echo "=== Instructions ==="
echo "1. Check the Electron app console for logs like:"
echo "   [ProxyManager] Initialized"
echo "   [PortDetector] Detected port"
echo ""
echo "2. If no logs, the app may need to be restarted"
echo "3. Switch between worktrees to trigger monitoring"
