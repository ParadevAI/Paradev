# Port Forwarding - Next Steps

## ✅ UPDATE: Monitoring is Now Connected!

**As of 2025-10-29:** Port monitoring now automatically starts when you switch between worktrees!

## What's Been Completed

The core infrastructure AND the integration for port detection and proxy routing is complete:

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

6. **Automatic Monitoring** ✅ NEW!
   - Port monitoring starts automatically when active worktree changes
   - Event listeners update detected ports in config
   - Proxy targets update automatically
   - Proxies initialize when workspace loads

## What Needs to Be Done

### 1. ~~Connect PortDetector to Terminals~~ ✅ DONE!

**Status:** Port detection now automatically starts when you switch to a worktree!

**What was done:**
- Modified `setActiveSelection()` in `workspace-operations.ts` to start monitoring all terminals in a worktree when it becomes active
- Added `getProcess()` method to `TerminalManager` to access PTY processes
- Added event listeners in `main.ts` for `port-detected` and `port-closed` events
- Events automatically update workspace config and proxy targets
- Added `initializeWorkspaceProxies()` that runs when workspace ID changes

**Files modified:**
- `apps/desktop/src/main/lib/workspace/workspace-operations.ts` - Added monitoring logic
- `apps/desktop/src/main/lib/terminal.ts` - Added `getProcess()` method
- `apps/desktop/src/main/windows/main.ts` - Added event listeners

### 2. ~~Initialize Proxies on Workspace Load~~ ✅ DONE!

**Status:** Proxies automatically initialize when you switch workspaces!

**What was done:**
- Modified `setActiveWorkspaceId()` to call `initializeWorkspaceProxies()`
- Proxies initialize if workspace has `ports` configured
- Monitoring starts for the active worktree's terminals
- Proxy targets update based on detected ports

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
