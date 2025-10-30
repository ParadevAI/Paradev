# Port Routing System Implementation Plan

## Overview
Implement a hybrid port detection + HTTP proxy system to route consistent canonical ports (e.g., 3000, 3001) to whichever worktree is currently active, supporting multiple services per worktree.

## Architecture Components

### 1. Configuration System
**Location:** `~/.superset/config.json` (existing workspace config file)

**Schema Updates:**
```typescript
interface Workspace {
  // ... existing fields
  ports?: Array<number | { name: string; port: number }>;
}

interface Worktree {
  // ... existing fields
  detectedPorts?: Record<string, number>;
}
```

**Example:**
```json
{
  "workspaces": [{
    "id": "workspace-uuid",
    "name": "superset",
    "ports": [
      { "name": "website", "port": 3000 },
      { "name": "docs", "port": 3001 }
    ],
    "worktrees": [{
      "id": "worktree-uuid",
      "branch": "main",
      "detectedPorts": {
        "website": 5173,
        "docs": 5174
      }
    }]
  }]
}
```

### 2. Port Detection System
**Location:** `apps/desktop/src/main/lib/port-detector.ts` (NEW)

**Features:**
- **Hybrid Detection:**
  - Primary: PID-based using `lsof -Pan -p <pid> -i4TCP -sTCP:LISTEN`
  - Secondary: Output parsing for instant feedback
- **Service Name Matching:** Detect service from terminal working directory
- **Polling:** Check every 2 seconds for port changes
- **Events:** Emit `port-detected` and `port-closed` events

**Key Methods:**
- `startMonitoring(terminalId, worktreeId)` - Begin monitoring terminal's processes
- `stopMonitoring(terminalId)` - Stop monitoring
- `getDetectedPorts(worktreeId)` - Get all detected ports for a worktree
- `parsePortsFromPID(pid)` - Query OS for listening ports

**Service Name Detection:**
```typescript
// Match terminal CWD to service name
// CWD: ~/.superset/worktrees/superset/main/apps/website
// Extract: "website" from path
```

### 3. HTTP Proxy Manager
**Location:** `apps/desktop/src/main/lib/proxy-manager.ts` (NEW)

**Dependencies:** `http-proxy` library

**Features:**
- Create reverse proxy servers for each canonical port
- WebSocket support via `ws: true` option
- Dynamic target updating when active worktree changes
- Error handling (502 when backend unavailable)
- Multiple concurrent proxies (one per canonical port)

**Key Methods:**
- `initialize(workspace)` - Create proxies from workspace.ports config
- `updateTargets(workspace)` - Update all proxy targets based on active worktree
- `start()` - Start all proxy servers
- `stop()` - Stop all proxy servers
- `getStatus()` - Get current proxy mappings for debugging

### 4. Type System Updates

**File:** `apps/desktop/src/shared/types.ts`

**Add:**
```typescript
interface Workspace {
  // ... existing fields
  ports?: Array<number | { name: string; port: number }>;
}

interface Worktree {
  // ... existing fields
  detectedPorts?: Record<string, number>;
}

interface DetectedPort {
  port: number;
  service?: string;
  terminalId: string;
  detectedAt: string;
}
```

### 5. IPC System Updates

**File:** `apps/desktop/src/shared/ipc-channels.ts`

**Add Channels:**
```typescript
"workspace-set-ports": {
  request: { workspaceId: string; ports: Array<number | { name: string; port: number }> };
  response: void;
}
"workspace-get-detected-ports": {
  request: { worktreeId: string };
  response: Record<string, number>;
}
"proxy-get-status": {
  request: void;
  response: Array<{ canonical: number; target?: number; service?: string; active: boolean }>;
}
```

**Add Events (main → renderer):**
- `port-detected` - When new port is detected
- `port-closed` - When port stops listening
- `proxy-updated` - When proxy targets change

**File:** `apps/desktop/src/main/lib/port-ipcs.ts` (NEW)

### 6. Integration Points

**Modify:** `apps/desktop/src/main/lib/terminal.ts`
- Import PortDetector singleton
- Call `portDetector.startMonitoring(id, worktreeId)` on terminal create
- Call `portDetector.stopMonitoring(id)` on terminal kill
- Pass worktree ID to monitoring (to associate detected ports)

**Modify:** `apps/desktop/src/main/lib/workspace-manager.ts`
- Import ProxyManager singleton
- Initialize ProxyManager when workspace is loaded (if `workspace.ports` exists)
- Update proxy targets when `activeWorktreeId` changes
- Stop proxies when workspace is closed
- Save `detectedPorts` to config when ports are detected

**Modify:** `apps/desktop/src/main/lib/workspace/workspace-operations.ts`
- Listen to port detection events
- Update `worktree.detectedPorts` when ports detected
- Persist to config file
- Trigger proxy update when active worktree changes

## Implementation Steps

### Phase 1: Core Infrastructure (2-3 hours)
1. Install `http-proxy` dependency: `bun add http-proxy` in `apps/desktop`
2. Install types: `bun add -d @types/http-proxy`
3. Create `port-detector.ts` with PID-based detection logic
4. Create `proxy-manager.ts` with basic HTTP proxy setup
5. Update `types.ts` with new Workspace/Worktree fields
6. Update `ipc-channels.ts` with new channel definitions
7. Create `port-ipcs.ts` with IPC handlers

### Phase 2: Port Detection (2 hours)
8. Implement `lsof` command execution in PortDetector
9. Add polling mechanism (setInterval every 2s)
10. Implement service name detection from terminal CWD
11. Add event emitters for port-detected/port-closed
12. Integrate PortDetector into TerminalManager
13. Test detection with `bun dev` in different apps

### Phase 3: Proxy System (2 hours)
14. Implement ProxyManager with http-proxy
15. Add WebSocket upgrade handling
16. Create proxy instances from workspace.ports config
17. Implement target updating logic
18. Add error handling (503/502 responses)
19. Test proxy forwarding with real dev servers

### Phase 4: Workspace Integration (1-2 hours)
20. Update WorkspaceManager to initialize ProxyManager
21. Connect active worktree switching to proxy updates
22. Save detectedPorts to worktree config when detected
23. Load and restore proxy state on app startup
24. Handle edge cases (no ports config, workspace close)

### Phase 5: Testing (1 hour)
25. Test with multiple worktrees running simultaneously
26. Test WebSocket passthrough (verify HMR works)
27. Test worktree switching updates proxy correctly
28. Test edge cases (server crash, port conflict, no config)
29. Add console logging for debugging

## Files to Create

- `apps/desktop/src/main/lib/port-detector.ts` (~200 lines)
- `apps/desktop/src/main/lib/proxy-manager.ts` (~250 lines)
- `apps/desktop/src/main/lib/port-ipcs.ts` (~100 lines)

## Files to Modify

- `apps/desktop/src/main/lib/terminal.ts` (~20 lines changed)
- `apps/desktop/src/main/lib/workspace-manager.ts` (~40 lines changed)
- `apps/desktop/src/main/lib/workspace/workspace-operations.ts` (~30 lines changed)
- `apps/desktop/src/shared/ipc-channels.ts` (~30 lines added)
- `apps/desktop/src/shared/types.ts` (~15 lines added)
- `apps/desktop/package.json` (add http-proxy dependency)

## Configuration Setup (Manual for Now)

Users will manually edit `~/.superset/config.json` to add ports:

```json
{
  "workspaces": [{
    "name": "superset",
    "ports": [
      { "name": "website", "port": 3000 },
      { "name": "docs", "port": 3001 },
      { "name": "blog", "port": 3002 }
    ]
  }]
}
```

UI for port configuration will be added in a future update.

## Key Technical Decisions

1. **Config Location:** Workspace-level in `~/.superset/config.json` (not in repo)
2. **Detection Method:** Hybrid PID-based + output parsing
3. **Proxy Library:** `http-proxy` (battle-tested, WebSocket support)
4. **Port Format:** Array of `number | { name: string; port: number }`
5. **Matching:** Named entries match by service, unnamed match by index
6. **State:** `workspace.ports` = config, `worktree.detectedPorts` = runtime state

## Expected Behavior

1. User manually adds `ports` config to workspace in `~/.superset/config.json`
2. App restarts, ProxyManager initializes with workspace.ports
3. Proxy servers start listening on canonical ports (3000, 3001, etc.)
4. User runs `bun dev` in Worktree A terminal
5. Dev server starts on available port (5173)
6. PortDetector (polling every 2s) detects port via `lsof`
7. Service name detected from terminal CWD (e.g., "website")
8. `worktree.detectedPorts.website = 5173` saved to config
9. ProxyManager updates: `localhost:3000` → `localhost:5173`
10. User opens `localhost:3000` in browser, sees Worktree A's website
11. User switches to Worktree B (which has website on 5174)
12. ProxyManager updates: `localhost:3000` → `localhost:5174`
13. Browser reconnects, HMR resumes with Worktree B

## Platform Support

- ✅ macOS: Uses `lsof` (built-in)
- ✅ Linux: Uses `lsof` (available on most distros)
- ⚠️ Windows: Not supported initially (would need `netstat` alternative)

## Estimated Effort

- **New Code:** ~550 lines
- **Modified Code:** ~135 lines
- **Dependencies:** 2 (http-proxy + @types/http-proxy)
- **Time:** 8-10 hours (implementation + testing)
