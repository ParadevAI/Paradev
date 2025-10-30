#!/bin/bash

echo "=== Testing Recursive Process Tree Detection ==="
echo ""

# Find shell PIDs that are children of Electron
SHELL_PIDS=$(ps -o pid,ppid,comm,args | grep "/bin/zsh -l" | grep -v grep | awk '{print $1}')

echo "1. Found shell PIDs (should be terminals):"
echo "$SHELL_PIDS"
echo ""

for pid in $SHELL_PIDS; do
    echo "2. Process tree for shell PID $pid:"

    # Manually do breadth-first search like the code
    all_pids=($pid)
    to_process=($pid)

    while [ ${#to_process[@]} -gt 0 ]; do
        current=${to_process[0]}
        to_process=("${to_process[@]:1}")

        children=$(pgrep -P $current 2>/dev/null || true)

        for child in $children; do
            echo "   PID $child: $(ps -p $child -o comm= 2>/dev/null)"
            all_pids+=($child)
            to_process+=($child)
        done
    done

    echo ""
    echo "3. All descendants of $pid:"
    printf '   %s\n' "${all_pids[@]}"
    echo ""

    echo "4. Checking each PID for listening ports:"
    for check_pid in "${all_pids[@]}"; do
        ports=$(lsof -Pan -p $check_pid -i4TCP -sTCP:LISTEN 2>/dev/null | awk 'NR>1 {print $9}' | sed 's/.*://' || true)
        if [ ! -z "$ports" ]; then
            echo "   ✅ PID $check_pid listening on: $ports"
        fi
    done
    echo ""
    echo "---"
    echo ""
done
