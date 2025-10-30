# Port Forwarding - Next Steps

## What's Been Completed

The core infrastructure for port detection and proxy routing is complete:

1. **Port Detection System** (`apps/desktop/src/main/lib/port-detector.ts`)
   - PID-based port detection using `lsof`
   - Service name detection from working directory
   - Event-based architecture (emits `port-detected` and `port-closed` events)
   - Polling every 2 seconds

2. **Proxy Manager** (`apps/desktop/src/main/lib/proxy-manager.ts`)
   - HTTP reverse proxy with WebSocket support
   - Dynamic target updating
   - Error handling (502/503 responses)
   - Multiple concurrent proxies

3. **Type System** (`apps/desktop/src/shared/types.ts`)
   - Added `ports` to Workspace
   - Added `detectedPorts` to Worktree
   - Added `DetectedPort` interface

4. **IPC Channels** (`apps/desktop/src/shared/ipc-channels.ts`)
   - `workspace-set-ports`
   - `workspace-get-detected-ports`
   - `proxy-get-status`

5. **Integration**
   - WorkspaceManager has proxy methods
   - workspace-operations has port detection persistence
   - IPCs registered in main process

## What Needs to Be Done

### 1. Connect PortDetector to Terminals ⚠️ CRITICAL

**Current Issue:** The PortDetector is created but never actually starts monitoring terminals.

**What to do:**

a) Find where terminals are created with worktree context (likely in `tab-operations.ts` or similar)

b) When a terminal tab is created, call:
```typescript
import { portDetector } from '../port-detector';

// In terminal creation code:
const ptyProcess = terminalManager.processes.get(terminalId);
portDetector.startMonitoring(terminalId, worktreeId, ptyProcess, cwd);
```

c) When a terminal is destroyed, call:
```typescript
portDetector.stopMonitoring(terminalId);
```

d) Listen to port detection events and update workspace config:
```typescript
import { portDetector } from './port-detector';
import { workspaceManager } from './workspace-manager';
import * as workspaceOps from './workspace/workspace-operations';

// Set up listeners (probably in main.ts or workspace initialization)
portDetector.on('port-detected', async ({ worktreeId, port, service }) => {
  // Get current detected ports
  const detectedPorts = portDetector.getDetectedPortsMap(worktreeId);

  // Find workspace that contains this worktree
  const workspaces = await workspaceManager.list();
  for (const workspace of workspaces) {
    const worktree = workspace.worktrees.find(wt => wt.id === worktreeId);
    if (worktree) {
      // Update detected ports in config
      workspaceOps.updateDetectedPorts(workspace.id, worktreeId, detectedPorts);

      // Update proxy if this is the active worktree
      if (workspace.activeWorktreeId === worktreeId) {
        await workspaceManager.updateProxyTargets(workspace.id);
      }
      break;
    }
  }
});
```

**Files to modify:**
- `apps/desktop/src/main/lib/workspace/tab-operations.ts` (or wherever terminals are created)
- `apps/desktop/src/main/windows/main.ts` (set up port detection listeners)

### 2. Initialize Proxies on Workspace Load

**What to do:**

When a workspace is loaded/opened, initialize the proxy manager:

```typescript
// In workspace-operations.ts or wherever workspaces are loaded
export async function loadWorkspace(workspaceId: string) {
  const workspace = getWorkspace(workspaceId);
  if (!workspace) return null;

  // Initialize proxy if ports are configured
  if (workspace.ports) {
    await workspaceManager.initializeProxyForWorkspace(workspaceId);
  }

  return workspace;
}
```

**Files to modify:**
- Find where workspaces are "activated" or "loaded" in the UI
- Add proxy initialization call there

### 3. Add UI Indicator

**What to show:**
- Port forwarding status (active/inactive)
- Which canonical ports are mapped to which actual ports
- Service names
- Visual indicator (🟢 green dot) when ports are active

**Example UI:**
```
Workspace: Superset
├── Worktree: main ⭐ (active)
│   ├── Terminal 1
│   └── 🟢 Ports: 3000 → 5173 (website), 3001 → 5174 (docs)
└── Worktree: feature-branch
    ├── Terminal 1
    └── 🔴 Ports: None active
```

**Where to add:**
- Workspace sidebar
- Worktree panel
- Status bar

**IPC calls to use:**
```typescript
// Get proxy status
const status = await window.ipcRenderer.invoke('proxy-get-status');
// Returns: [{ canonical: 3000, target: 5173, service: "website", active: true }]

// Get detected ports for a worktree
const detectedPorts = await window.ipcRenderer.invoke('workspace-get-detected-ports', {
  worktreeId: 'xxx'
});
// Returns: { website: 5173, docs: 5174 }
```

**Files to create/modify:**
- `apps/desktop/src/renderer/components/PortStatus.tsx` (new component)
- Add to sidebar or worktree panel

### 4. Configuration Setup

**Manual configuration (for now):**

Users need to manually edit `~/.superset/config.json`:

```json
{
  "workspaces": [{
    "id": "workspace-uuid",
    "name": "superset",
    "ports": [
      { "name": "website", "port": 3000 },
      { "name": "docs", "port": 3001 },
      { "name": "blog", "port": 3002 }
    ]
  }]
}
```

**Future:** Add UI for port configuration (not needed for MVP)

### 5. Testing

**Test scenarios:**

1. **Basic Port Detection:**
   ```bash
   # In a worktree terminal
   cd apps/website
   bun dev
   # Should detect port 5173, service "website"
   ```

2. **Proxy Routing:**
   ```bash
   # With website running on port 5173
   curl http://localhost:3000
   # Should proxy to 5173
   ```

3. **Worktree Switching:**
   - Start dev server in Worktree A
   - Switch to Worktree B (with its own dev server)
   - Proxy should update targets
   - Browser refresh should show Worktree B's content

4. **WebSocket (HMR):**
   - Make a code change in Worktree A
   - Browser should hot-reload via proxied WebSocket

5. **Multiple Services:**
   - Run website (3000), docs (3001), blog (3002) simultaneously
   - All should be accessible via canonical ports

## Quick Start for Testing

1. **Add port config** to your workspace in `~/.superset/config.json`

2. **Connect terminals** to port detector (step 1 above)

3. **Run a dev server**:
   ```bash
   cd apps/website
   bun dev
   ```

4. **Check logs** for port detection:
   ```
   [PortDetector] Detected port 5173 (website) in terminal xxx
   [ProxyManager] Port 3000 (website) → 5173
   ```

5. **Test proxy**:
   ```bash
   curl http://localhost:3000
   ```

## Architecture Diagram

```
Terminal (PTY)
    ↓ (PID)
PortDetector (lsof polling)
    ↓ (port-detected event)
Workspace Config (detectedPorts)
    ↓ (on worktree switch)
ProxyManager (update targets)
    ↓ (HTTP/WebSocket)
Browser (localhost:3000)
    ↓ (proxied)
Dev Server (localhost:5173)
```

## Troubleshooting

**Ports not detected:**
- Check terminal has worktree context
- Verify `lsof` is available on your system
- Check console logs for PortDetector errors

**Proxy not working:**
- Verify workspace has `ports` configuration
- Check ProxyManager is initialized
- Look for proxy errors in console

**Type errors:**
- Run `bun run typecheck` in `apps/desktop`
- Current known issues are in release modules (not related to ports)

## Files Reference

**Created:**
- `apps/desktop/src/main/lib/port-detector.ts`
- `apps/desktop/src/main/lib/proxy-manager.ts`
- `apps/desktop/src/main/lib/port-ipcs.ts`

**Modified:**
- `apps/desktop/src/shared/types.ts`
- `apps/desktop/src/shared/ipc-channels.ts`
- `apps/desktop/src/main/lib/workspace-manager.ts`
- `apps/desktop/src/main/lib/workspace/workspace-operations.ts`
- `apps/desktop/src/main/windows/main.ts`

**Dependencies Added:**
- `http-proxy@1.18.1`
- `@types/http-proxy@1.17.17`
