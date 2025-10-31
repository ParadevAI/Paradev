# tmux Session Persistence Design

## Overview

Integrate tmux with node-pty to enable terminal session persistence across app restarts. Instead of spawning shell processes directly, the app will spawn tmux sessions that continue running when the app closes.

## Current Architecture

**TerminalManager** (apps/desktop/src/main/lib/terminal.ts:7)
- Spawns shells directly using `pty.spawn(shell, args, options)`
- Stores processes in `Map<string, pty.IPty>`
- Keeps output history in memory
- **On app close**: Calls `killAll()` which terminates all processes
- **No persistence**: All terminal state is lost on app restart

## Proposed Architecture

### Session Naming Convention

Each terminal session maps to a tmux session with a deterministic name:
```
superset-<terminal-id>
```

Example: `superset-550e8400-e29b-41d4-a716-446655440000`

### Modified Terminal Lifecycle

#### 1. Terminal Creation

**Current**:
```typescript
pty.spawn(shell, shellArgs, { cwd, cols, rows, env })
```

**Proposed**:
```typescript
// Check if tmux session exists
const sessionName = `superset-${id}`;
const sessionExists = await checkTmuxSession(sessionName);

if (sessionExists) {
  // Reattach to existing session
  pty.spawn('tmux', ['attach-session', '-t', sessionName], { cols, rows })
} else {
  // Create new session with user's shell
  pty.spawn('tmux', [
    'new-session',
    '-s', sessionName,  // Session name
    '-c', cwd,          // Working directory
    '-x', cols,         // Width
    '-y', rows,         // Height
    shell               // Shell to run
  ], { env })
}
```

#### 2. Terminal Destruction

**User closes terminal tab**:
```typescript
// Explicitly kill the tmux session
tmux kill-session -t superset-<id>
```

**App closes** (terminal-ipcs.ts:59):
```typescript
// DO NOT kill sessions - just detach
// Sessions remain running in background
terminalManager.detachAll()  // New method
```

#### 3. App Startup

**Option A: Auto-restore all sessions**
```typescript
// List all superset tmux sessions
const sessions = await listSupersetSessions()
// Offer to restore each session in UI
```

**Option B: Manual restore**
```typescript
// Add UI button to "Restore Previous Sessions"
// User explicitly chooses which sessions to restore
```

### Implementation Plan

#### Phase 1: Core tmux Integration

**1. Add tmux utility module** (`apps/desktop/src/main/lib/tmux-utils.ts`)
```typescript
export async function checkTmuxInstalled(): Promise<boolean>
export async function listTmuxSessions(): Promise<string[]>
export async function listSupersetSessions(): Promise<string[]>
export async function sessionExists(name: string): Promise<boolean>
export async function killTmuxSession(name: string): Promise<boolean>
```

**2. Modify TerminalManager.create()** (terminal.ts:29)
- Add `persist?: boolean` option (default: false for backwards compatibility)
- When `persist: true`, use tmux session instead of direct spawn
- Fall back to direct spawn if tmux not available

**3. Modify TerminalManager.kill()** (terminal.ts:126)
- If session is tmux-backed, call `tmux kill-session`
- Otherwise use existing `process.kill()`

**4. Add TerminalManager.detachAll()** (new method)
- Instead of killing, detach from all tmux sessions
- Keep sessions running in background
- Call this on app close instead of `killAll()`

**5. Add TerminalManager.listOrphanedSessions()** (new method)
- Return list of superset tmux sessions not currently attached
- UI can offer to restore these

#### Phase 2: Session Restore

**1. Add IPC channel** (`ipc-channels.ts`)
```typescript
"terminal-list-orphaned": {
  request: void;
  response: Array<{ id: string; name: string; created: Date }>;
}
"terminal-restore": {
  request: { id: string };
  response: { success: boolean; error?: string };
}
```

**2. Add restore UI**
- Show notification or modal on app start if orphaned sessions exist
- Allow user to selectively restore or clean up old sessions

#### Phase 3: Enhanced Features

**1. Session metadata**
- Store session metadata (workspace, tab name, etc.) in tmux environment
- `tmux setenv -t <session> SUPERSET_WORKSPACE_ID <id>`

**2. History recovery**
- Use tmux's capture-pane to recover terminal history
- `tmux capture-pane -t <session> -p -S -32768`

**3. Health monitoring**
- Periodically check if tmux sessions are still alive
- Clean up zombie sessions

## Trade-offs Analysis

### Pros

- **Persistence**: Terminal sessions survive app crashes and intentional closes
- **State recovery**: Can restore running processes, current directory, command history
- **Manual access**: Users can attach to sessions via terminal with `tmux attach -t superset-<id>`
- **Debugging**: Easier to inspect terminal state outside the app
- **Resilience**: Long-running processes (builds, servers) won't be killed on app close

### Cons

- **Dependency**: Requires tmux to be installed (can detect and gracefully degrade)
- **Complexity**: Additional layer of indirection and state management
- **Overhead**: Slight performance overhead from tmux layer
- **Session management**: Need to handle orphaned sessions and cleanup
- **Platform support**: tmux not available on Windows (PowerShell doesn't have tmux)

### Risks & Mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| tmux not installed | High | Detect on startup, show warning, fall back to direct spawn |
| Orphaned sessions | Medium | Periodic cleanup, UI to list/remove old sessions |
| Session name conflicts | Low | Use UUIDs, check existence before creating |
| Windows compatibility | High | Feature flag for Unix-only, use alternative on Windows |
| Memory leaks | Medium | Implement session TTL, auto-kill inactive sessions after N days |

## Configuration Options

Add to app settings:

```typescript
interface AppSettings {
  terminal: {
    // Enable session persistence (Unix only)
    persistSessions: boolean;  // default: false

    // Auto-restore sessions on app start
    autoRestore: boolean;  // default: false

    // Clean up orphaned sessions older than X days
    sessionTTLDays: number;  // default: 7

    // Maximum number of orphaned sessions to keep
    maxOrphanedSessions: number;  // default: 10
  }
}
```

## Alternative: tmux Control Mode

Instead of spawning tmux in a pty, use **tmux control mode** (`-C` flag):

```bash
tmux -C new-session -s superset-xyz
```

**Benefits**:
- Structured output (easier to parse)
- Better programmatic control
- Can capture events and state changes

**Requires**:
- Parsing tmux control protocol
- More complex implementation

**Recommendation**: Start with basic tmux integration, consider control mode for Phase 3.

## Testing Checklist

- [ ] Detect tmux installation correctly on macOS/Linux
- [ ] Create new tmux session with correct shell and cwd
- [ ] Attach to existing session after app restart
- [ ] Kill session when user closes terminal tab
- [ ] Preserve sessions when app closes normally
- [ ] List orphaned sessions on app start
- [ ] Restore session with full history
- [ ] Handle gracefully when tmux not installed
- [ ] Clean up sessions older than TTL
- [ ] Verify no zombie tmux processes

## Implementation Estimate

- **Phase 1** (Core integration): 2-3 days
- **Phase 2** (Session restore): 1-2 days
- **Phase 3** (Enhanced features): 2-3 days

**Total**: ~1 week for full implementation

## References

- tmux man page: https://man7.org/linux/man-pages/man1/tmux.1.html
- node-pty + tmux discussion: https://github.com/chjj/pty.js/issues/68
- tmux control mode: https://github.com/tmux/tmux/wiki/Control-Mode
