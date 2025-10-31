# Terminal Session Persistence Architecture

## Overview

This document outlines the architecture for persistent terminal sessions in the Superset Desktop app. Terminal sessions will survive app restarts by leveraging tmux, allowing long-running processes to continue in the background and seamlessly reconnect when the app reopens.

## Table of Contents

- [Goals](#goals)
- [Current vs Proposed Architecture](#current-vs-proposed-architecture)
- [Approach Analysis](#approach-analysis)
- [Recommended Solution: tmux Integration](#recommended-solution-tmux-integration)
- [Implementation Plan](#implementation-plan)
- [Technical Details](#technical-details)
- [Data Models](#data-models)
- [Error Handling](#error-handling)
- [Testing Strategy](#testing-strategy)
- [Security Considerations](#security-considerations)
- [Migration & Rollout](#migration--rollout)
- [Future Enhancements](#future-enhancements)

## Goals

1. **Background Execution**: Terminal sessions continue running when app is closed
2. **Seamless Reconnection**: Automatically reconnect to sessions when app reopens
3. **Session Persistence**: Maintain session state across app restarts
4. **Optional Recovery**: Support recovery from laptop restart (state-based)
5. **Consistency**: Reliable behavior across all scenarios
6. **Platform Support**: Work on macOS/Linux, graceful degradation on Windows

## Current vs Proposed Architecture

### Current Architecture (node-pty direct)

**TerminalManager** (`apps/desktop/src/main/lib/terminal.ts:7`)

```typescript
// Spawns shells directly
pty.spawn(shell, args, { cwd, cols, rows, env })

// Stores processes in Map
Map<string, pty.IPty>

// On app close: killAll() terminates everything
// ❌ All terminal state lost on restart
```

**Problems**:
- No persistence across app restarts
- Long-running processes killed when app closes
- No session recovery mechanism
- Lost state on app crashes

### Proposed Architecture (tmux-backed)

```
┌─────────────────────────────────────────────────────────────┐
│                     Electron Main Process                    │
│                                                               │
│  ┌────────────────────────────────────────────────────────┐ │
│  │           TmuxSessionManager                           │ │
│  │  - Create/list/attach/detach tmux sessions            │ │
│  │  - Map terminal-id -> tmux session                     │ │
│  │  - Handle session lifecycle                            │ │
│  │  - Persist session metadata                            │ │
│  └────────────────────────────────────────────────────────┘ │
│                          │                                    │
│                          │ spawns/controls                    │
│                          ▼                                    │
│  ┌────────────────────────────────────────────────────────┐ │
│  │           TmuxControlClient                            │ │
│  │  - Communicates via tmux control mode (-CC)           │ │
│  │  - Parses control mode protocol                        │ │
│  │  - Sends commands to tmux                              │ │
│  │  - Streams output to renderer                          │ │
│  └────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────┘
                          │
                          │ stdin/stdout
                          ▼
┌─────────────────────────────────────────────────────────────┐
│                    tmux (system process)                     │
│                                                               │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐      │
│  │  session-1   │  │  session-2   │  │  session-3   │      │
│  │  (terminal)  │  │  (terminal)  │  │  (terminal)  │      │
│  └──────────────┘  └──────────────┘  └──────────────┘      │
│  ↑ Persist when app closes                                  │
└─────────────────────────────────────────────────────────────┘
```

## Approach Analysis

### Option 1: tmux-Based Solution ✅ **RECOMMENDED**

**Architecture**: Use tmux sessions managed by Electron app

**Pros**:
- ✅ Sessions naturally persist when app closes
- ✅ Built-in session management and recovery
- ✅ Can survive app crashes and force quits
- ✅ Mature, battle-tested technology (decades of production use)
- ✅ Easy reconnection via tmux attach
- ✅ Optional persistence across reboots (tmux-resurrect)
- ✅ Users can manually inspect sessions: `tmux attach -t superset-<id>`
- ✅ Handles multiple sessions efficiently
- ✅ Built-in scrollback buffer management

**Cons**:
- ❌ Requires tmux installed on user's system
- ❌ Platform-specific (Unix-like systems only)
- ❌ Need to parse tmux control mode protocol
- ❌ May have different behavior than node-pty

**Implementation Complexity**: Medium-High

### Option 2: Background Service Process

**Architecture**: Separate Node.js daemon managing node-pty terminals

**Pros**:
- ✅ Cross-platform (Windows, macOS, Linux)
- ✅ Keeps existing node-pty integration
- ✅ Full control over implementation

**Cons**:
- ❌ Complex IPC between Electron and daemon
- ❌ Process lifecycle management complexity
- ❌ Need to handle daemon crashes/restarts
- ❌ More code to maintain and debug
- ❌ Harder to recover from system restarts
- ❌ Security considerations (daemon running as user)

**Implementation Complexity**: High

### Option 3: Hybrid Approach

**Architecture**: Background service wrapping tmux

**Pros**:
- ✅ Best of both worlds

**Cons**:
- ❌ Most complex to implement
- ❌ Two systems to maintain

**Implementation Complexity**: Very High

### Decision: tmux-Based Solution

**Rationale**:
1. **Purpose-built**: tmux is designed exactly for this use case
2. **Reliability**: Decades of production use in critical environments
3. **Recovery**: Built-in session persistence and restoration
4. **Simplicity**: Less code to maintain than custom daemon
5. **Developer-friendly**: Many developers already familiar with tmux
6. **Proven**: Used by VS Code Remote, tmuxinator, and countless other tools

## Recommended Solution: tmux Integration

### Session Naming Convention

Each terminal session maps to a unique tmux session:

```
superset-<terminal-id>
```

Example: `superset-550e8400-e29b-41d4-a716-446655440000`

**Benefits**:
- Easy identification of Superset sessions: `tmux ls | grep superset-`
- UUID ensures no collisions
- Maps directly to terminal ID in app
- Simple cleanup: `tmux kill-session -t superset-*`

### Terminal Lifecycle

#### 1. Terminal Creation

**Without existing session**:
```typescript
const sessionName = `superset-${terminalId}`;
pty.spawn('tmux', [
  'new-session',
  '-s', sessionName,    // Session name
  '-c', cwd,            // Working directory
  '-x', cols,           // Width
  '-y', rows,           // Height
  shell                 // Shell to run (bash, zsh, etc.)
], { env })
```

**With existing session (reconnect)**:
```typescript
const sessionExists = await checkTmuxSession(sessionName);
if (sessionExists) {
  pty.spawn('tmux', ['attach-session', '-t', sessionName], { cols, rows })
}
```

#### 2. Terminal Destruction

**User closes terminal tab**:
```typescript
// Explicitly kill the tmux session
await exec(`tmux kill-session -t ${sessionName}`);
```

**App closes** (normal exit):
```typescript
// DO NOT kill sessions - just detach
// Sessions remain running in background
terminalManager.detachAll(); // New method
```

#### 3. App Startup

**Restore flow**:
```typescript
// 1. List all superset tmux sessions
const sessions = await listSupersetSessions();

// 2. Load saved metadata from persistence
const savedSessions = await db.getTerminalSessions();

// 3. Match and restore
for (const session of sessions) {
  const metadata = savedSessions.find(s => s.tmuxSessionName === session);
  if (metadata) {
    // Offer to restore in UI
    showRestorePrompt(metadata);
  } else {
    // Orphaned session - offer cleanup
    offerCleanup(session);
  }
}
```

### tmux Control Mode

tmux provides `-CC` control mode designed for IDE integration:

```bash
# Start control mode
tmux -CC new-session -s session-name

# Control mode protocol (line-based, structured output)
%begin <timestamp> <pane-id> <flags>
<output data>
%end <timestamp> <pane-id> <flags>

%session-changed <session-id> <session-name>
%window-add <window-id>
%layout-change <window-id> <layout>
%output <pane-id> <output-data>
```

**Benefits**:
- Structured, parseable output (vs raw terminal)
- Event notifications (session changes, output, etc.)
- Programmatic control
- Multiple clients can attach simultaneously
- Reliable state tracking

## Implementation Plan

### Phase 1: Core tmux Integration (2-3 weeks)

**Files to Create**:
- `apps/desktop/src/main/lib/tmux-utils.ts` - Utility functions
- `apps/desktop/src/main/lib/tmux-control-client.ts` - Control mode handler
- `apps/desktop/src/main/lib/tmux-session-manager.ts` - Session lifecycle

**Files to Modify**:
- `apps/desktop/src/main/lib/terminal-ipcs.ts` - Add tmux IPC handlers
- `apps/desktop/src/main/lib/terminal.ts` - Integrate TmuxSessionManager
- `apps/desktop/src/shared/ipc-channels.ts` - Add new IPC channels

**Tasks**:

**1. TmuxUtils Module**
```typescript
// apps/desktop/src/main/lib/tmux-utils.ts
export async function checkTmuxInstalled(): Promise<boolean>;
export async function listTmuxSessions(): Promise<string[]>;
export async function listSupersetSessions(): Promise<string[]>;
export async function sessionExists(name: string): Promise<boolean>;
export async function killTmuxSession(name: string): Promise<boolean>;
export async function getTmuxVersion(): Promise<string | null>;
```

**2. TmuxControlClient Class**
```typescript
// apps/desktop/src/main/lib/tmux-control-client.ts
class TmuxControlClient {
  private process: pty.IPty;
  private buffer: string;

  // Spawn tmux in control mode
  constructor(sessionName: string, options: TmuxOptions);

  // Parse control mode protocol
  private parseControlOutput(data: string): ControlEvent[];

  // Handle different event types
  on(event: 'output', handler: (data: string) => void): void;
  on(event: 'session-changed', handler: (session: string) => void): void;
  on(event: 'exit', handler: (code: number) => void): void;

  // Send commands to tmux
  sendCommand(cmd: string): Promise<void>;
  resize(cols: number, rows: number): void;
  write(data: string): void;
  kill(): void;
}
```

**3. TmuxSessionManager Class**
```typescript
// apps/desktop/src/main/lib/tmux-session-manager.ts
class TmuxSessionManager {
  private sessions: Map<string, TmuxControlClient>;
  private metadata: SessionMetadataStore;

  async createSession(config: {
    terminalId: string;
    workspaceId?: string;
    cwd: string;
    cols: number;
    rows: number;
    shell?: string;
  }): Promise<TerminalSession>;

  async attachSession(terminalId: string): Promise<TerminalSession | null>;
  async detachSession(terminalId: string): Promise<void>;
  async killSession(terminalId: string): Promise<void>;

  async listSessions(): Promise<TerminalSession[]>;
  async listOrphanedSessions(): Promise<TerminalSession[]>;
  async cleanupOrphanedSessions(): Promise<void>;

  // Get or create (idempotent)
  async getOrCreateSession(terminalId: string, config: SessionConfig): Promise<TerminalSession>;

  // Detach all on app close
  detachAll(): void;
}
```

**4. Session State Persistence**
```typescript
// Store in SQLite (using existing Drizzle setup)
// apps/desktop/src/main/lib/session-metadata-store.ts
class SessionMetadataStore {
  async saveSession(session: TerminalSession): Promise<void>;
  async getSession(terminalId: string): Promise<TerminalSession | null>;
  async getAllSessions(): Promise<TerminalSession[]>;
  async deleteSession(terminalId: string): Promise<void>;
  async cleanupStale(maxAgeDays: number): Promise<number>;
}
```

**5. IPC Channels**
```typescript
// apps/desktop/src/shared/ipc-channels.ts
interface IpcChannels {
  "terminal:create": {
    request: {
      terminalId: string;
      workspaceId?: string;
      cwd: string;
      cols: number;
      rows: number;
      persist?: boolean; // Feature flag
    };
    response: IpcResponse<{ sessionId: string }>;
  };

  "terminal:attach": {
    request: { terminalId: string };
    response: IpcResponse<{ sessionId: string }>;
  };

  "terminal:send": {
    request: { terminalId: string; data: string };
    response: IpcResponse<void>;
  };

  "terminal:resize": {
    request: { terminalId: string; cols: number; rows: number };
    response: IpcResponse<void>;
  };

  "terminal:list-orphaned": {
    request: void;
    response: TerminalSession[];
  };

  "terminal:restore": {
    request: { terminalId: string };
    response: IpcResponse<{ sessionId: string }>;
  };

  "terminal:cleanup-orphaned": {
    request: void;
    response: IpcResponse<{ count: number }>;
  };
}
```

**6. Modify TerminalManager**
```typescript
// apps/desktop/src/main/lib/terminal.ts
class TerminalManager {
  private tmuxManager: TmuxSessionManager;
  private useTmux: boolean; // Feature flag

  constructor() {
    this.useTmux = settings.get('terminal.persistSessions', false);
    this.tmuxManager = new TmuxSessionManager();
  }

  async create(options: CreateOptions) {
    if (this.useTmux && await checkTmuxInstalled()) {
      return this.tmuxManager.createSession(options);
    }
    // Fall back to node-pty
    return this.createNodePtyTerminal(options);
  }

  // Add new method for app close
  detachAll() {
    if (this.useTmux) {
      this.tmuxManager.detachAll();
    } else {
      this.killAll();
    }
  }
}
```

### Phase 2: Reconnection Logic (1-2 weeks)

**On App Startup**:
1. Check tmux installed: `checkTmuxInstalled()`
2. List Superset sessions: `tmux ls | grep 'superset-'`
3. Load saved metadata from database
4. Match tmux sessions to metadata
5. Show restore UI if orphaned sessions exist
6. Clean up stale/dead sessions

**On Workspace/Tab Open**:
1. Check if terminal ID has existing session
2. If yes: attach to session
3. If no: create new session
4. Stream output to renderer

**On App Close**:
1. Call `terminalManager.detachAll()`
2. Save all session metadata to database
3. Sessions continue running in background

**Restore UI**:
```typescript
// Show notification/modal on startup
if (orphanedSessions.length > 0) {
  showNotification({
    title: 'Restore Terminal Sessions?',
    message: `${orphanedSessions.length} sessions from previous session`,
    actions: ['Restore All', 'Select', 'Ignore']
  });
}
```

### Phase 3: UI/UX Enhancements (1-2 weeks)

**Reconnection Indicator**:
- Show "Reconnecting..." state while attaching
- Display session uptime
- Show last command/output preview

**Session Management Panel**:
- List all active sessions
- Show attached/detached status
- Resource usage (if available)
- Manual cleanup actions

**Settings Panel**:
```typescript
interface TerminalSettings {
  persistSessions: boolean;          // Enable feature
  autoRestore: boolean;               // Auto-restore on startup
  sessionTTLDays: number;             // Cleanup after N days
  maxOrphanedSessions: number;        // Limit orphaned sessions
}
```

### Phase 4: Recovery from System Restart (Optional, 1-2 weeks)

**Approach: State-Based Recovery**

Since tmux sessions don't survive system reboots, we'll save enough state to recreate sessions:

```typescript
interface SessionState {
  terminalId: string;
  cwd: string;
  env: Record<string, string>;
  commandHistory: string[];
  lastCommand: string;
  createdAt: number;
  lastActive: number;
}

// Before session ends, save state
async saveSessionState(session: TerminalSession) {
  const state: SessionState = {
    terminalId: session.id,
    cwd: await getCurrentDir(session),
    env: session.env,
    commandHistory: await getHistory(session),
    lastCommand: await getLastCommand(session),
    createdAt: session.created,
    lastActive: Date.now(),
  };
  await db.saveSessionState(state);
}

// On app restart after reboot
async recreateSession(state: SessionState) {
  const session = await createSession({
    terminalId: state.terminalId,
    cwd: state.cwd,
    env: state.env,
  });

  // Notify user
  showNotification({
    message: 'Session recreated (system was restarted)',
    details: `Working directory: ${state.cwd}`,
  });
}
```

**Future: tmux-resurrect Integration** (more complex but true persistence)
- Integrate tmux-resurrect plugin
- Automatically save tmux state periodically
- Restore full session tree after reboot

## Technical Details

### Platform Compatibility

| Platform | tmux Available | Strategy |
|----------|----------------|----------|
| macOS    | ✅ Pre-installed (modern versions) | Use tmux by default |
| Linux    | ✅ Available in all package managers | Use tmux if installed, offer install instructions |
| Windows  | ⚠️ Requires WSL | Detect WSL, fall back to node-pty, show installation guide |

**Windows Detection**:
```typescript
async function canUseTmux(): Promise<boolean> {
  if (process.platform === 'win32') {
    // Check if running in WSL
    return await isWSL();
  }
  return await checkTmuxInstalled();
}
```

### Performance Considerations

**Output Buffering**:
- tmux maintains configurable scrollback buffer
- Default: 2000 lines
- On reconnect: replay buffer contents
- Configuration: `set-option -g history-limit 10000`

**Multiple Sessions**:
- Each tmux session is lightweight (~1-2 MB RAM)
- Hundreds of sessions feasible on modern hardware
- Monitor system resources in production

**Control Mode vs Raw**:
- Control mode adds minimal overhead
- Structured output easier to parse
- More reliable than regex on raw output

### Migration Strategy

**Feature Flag**:
```typescript
// Gradual rollout via settings
settings.set('terminal.persistSessions', true);
```

**Factory Pattern**:
```typescript
interface ITerminalProvider {
  create(options: TerminalOptions): Promise<Terminal>;
  attach(id: string): Promise<Terminal>;
  list(): Promise<Terminal[]>;
}

class NodePtyProvider implements ITerminalProvider { /* ... */ }
class TmuxProvider implements ITerminalProvider { /* ... */ }

// Select provider based on capability and settings
function getTerminalProvider(): ITerminalProvider {
  const persistEnabled = settings.get('terminal.persistSessions');
  const tmuxAvailable = checkTmuxInstalled();

  if (persistEnabled && tmuxAvailable) {
    return new TmuxProvider();
  }
  return new NodePtyProvider();
}
```

## Data Models

### TerminalSession

```typescript
interface TerminalSession {
  id: string;                    // UUID (terminal ID)
  tmuxSessionName: string;       // superset-<id>
  workspaceId?: string;          // Optional workspace association
  created: number;               // Timestamp (ms)
  lastAttached: number;          // Timestamp (ms)
  lastDetached: number;          // Timestamp (ms)
  cwd: string;                   // Working directory
  status: 'attached' | 'detached' | 'dead';
  dimensions: {
    cols: number;
    rows: number;
  };
  shell: string;                 // Shell path (bash, zsh, etc.)
  metadata?: {
    title?: string;
    customName?: string;
    tags?: string[];
  };
}
```

### Database Schema (Drizzle ORM)

```typescript
// apps/desktop/packages/db/src/schema/terminal-sessions.ts
import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core';

export const terminalSessions = sqliteTable('terminal_sessions', {
  id: text('id').primaryKey(),
  tmuxSessionName: text('tmux_session_name').notNull().unique(),
  workspaceId: text('workspace_id'),
  createdAt: integer('created_at').notNull(),
  lastAttachedAt: integer('last_attached_at'),
  lastDetachedAt: integer('last_detached_at'),
  cwd: text('cwd').notNull(),
  status: text('status').notNull(), // 'attached' | 'detached' | 'dead'
  cols: integer('cols').notNull(),
  rows: integer('rows').notNull(),
  shell: text('shell').notNull(),
  metadata: text('metadata'), // JSON string
});

// Indexes
export const terminalSessionsWorkspaceIdIdx = index('terminal_sessions_workspace_id_idx')
  .on(terminalSessions.workspaceId);
export const terminalSessionsStatusIdx = index('terminal_sessions_status_idx')
  .on(terminalSessions.status);
```

## Error Handling

### Error Scenarios & Mitigations

| Scenario | Detection | Recovery | User Experience |
|----------|-----------|----------|-----------------|
| **tmux not installed** | On startup: `which tmux` | Fall back to node-pty | Show one-time notification with install instructions |
| **tmux session crashed** | Periodic health checks | Clean up metadata, offer recreate | Show error notification, remove from session list |
| **Session name collision** | Check existence before create | Generate new name with suffix | Transparent to user |
| **Orphaned sessions** | On startup: list vs database | Show cleanup UI | Prompt to restore or remove |
| **Permission issues** | tmux command errors | Log error, fall back to node-pty | Show error message with suggestions |
| **tmux version too old** | Parse version number | Warn and disable feature | Show upgrade notification |
| **Socket permission error** | EACCES on tmux commands | Check/fix socket permissions | Show permission fix instructions |

### Error Messages

```typescript
const ERROR_MESSAGES = {
  TMUX_NOT_FOUND: {
    title: 'tmux not found',
    message: 'Persistent terminal sessions require tmux to be installed.',
    actions: [
      { label: 'Install Instructions', action: 'open-docs' },
      { label: 'Disable Feature', action: 'disable-persistence' }
    ]
  },
  SESSION_CRASHED: {
    title: 'Terminal session lost',
    message: 'The terminal session has crashed or was killed externally.',
    actions: [
      { label: 'Recreate Session', action: 'recreate' },
      { label: 'Close', action: 'close' }
    ]
  },
  ATTACH_FAILED: {
    title: 'Failed to reconnect',
    message: 'Could not reconnect to the terminal session.',
    actions: [
      { label: 'Retry', action: 'retry' },
      { label: 'Create New', action: 'create-new' }
    ]
  }
};
```

## Testing Strategy

### Unit Tests

**TmuxUtils**:
- Test session name parsing
- Test version detection
- Test session listing/filtering

**TmuxControlClient**:
- Test control mode protocol parsing
- Test event emission
- Test command handling

**TmuxSessionManager**:
- Test session lifecycle
- Test metadata persistence
- Test orphaned session detection

### Integration Tests

**Full Lifecycle**:
```typescript
test('create, detach, reattach session', async () => {
  const manager = new TmuxSessionManager();

  // Create
  const session = await manager.createSession({
    terminalId: 'test-123',
    cwd: '/tmp',
    cols: 80,
    rows: 24,
  });
  expect(session.status).toBe('attached');

  // Detach
  await manager.detachSession('test-123');
  expect(await checkTmuxSession('superset-test-123')).toBe(true);

  // Reattach
  const reattached = await manager.attachSession('test-123');
  expect(reattached.id).toBe('test-123');

  // Cleanup
  await manager.killSession('test-123');
});
```

**Reconnection After Restart**:
```typescript
test('reconnect after simulated restart', async () => {
  // Create session
  const manager1 = new TmuxSessionManager();
  await manager1.createSession({ terminalId: 'test-456', cwd: '/tmp', cols: 80, rows: 24 });
  manager1.detachAll();

  // Simulate restart
  const manager2 = new TmuxSessionManager();
  const orphaned = await manager2.listOrphanedSessions();
  expect(orphaned).toHaveLength(1);
  expect(orphaned[0].id).toBe('test-456');

  // Restore
  await manager2.attachSession('test-456');
});
```

### Manual Testing Checklist

- [ ] Install/uninstall tmux, verify graceful degradation
- [ ] Create terminal, close app, reopen, verify reconnection
- [ ] Create multiple terminals, close app, reopen, verify all reconnect
- [ ] Close terminal tab, verify session is killed
- [ ] Force quit app, verify sessions survive
- [ ] Kill tmux process manually (`tmux kill-server`), verify app handles gracefully
- [ ] Restart laptop, verify state-based recovery works
- [ ] Delete workspace with active terminal, verify cleanup
- [ ] Test with slow/laggy terminal output
- [ ] Test with large scrollback buffer
- [ ] Test session after 24 hours idle
- [ ] Test with 10+ concurrent sessions

## Security Considerations

1. **Session Isolation**
   - Each user's tmux sessions isolated by OS user account
   - tmux socket: `~/.tmux-<uid>/<server-name>` (user-only permissions)

2. **Socket Permissions**
   - tmux automatically sets `0700` (user-only) on socket directory
   - Verify on startup: check permissions and warn if compromised

3. **Command Injection Prevention**
   ```typescript
   // ❌ UNSAFE
   exec(`tmux new-session -s ${userInput}`);

   // ✅ SAFE
   spawn('tmux', ['new-session', '-s', sanitizeSessionName(userInput)]);
   ```

4. **Session Names**
   - Use UUIDs (no sensitive data)
   - Don't include: workspace names, file paths, user data

5. **Output Sanitization**
   - Be careful with terminal escape sequences
   - Sanitize before rendering in Electron
   - Use libraries like `ansi-regex` to filter dangerous sequences

6. **Environment Variables**
   - Don't persist sensitive env vars (tokens, passwords)
   - Whitelist safe variables for recreation

## Documentation

### User-Facing Documentation

**Feature Announcement**:
```markdown
# Persistent Terminal Sessions

Your terminal sessions now survive app restarts!

- Close the app without losing running processes
- Automatically reconnects when you reopen
- Long-running builds, servers, and watch commands keep running

**Requirements**: tmux (pre-installed on macOS, installable on Linux)
**Enable in**: Settings → Terminal → Persistent Sessions
```

**Troubleshooting Guide**:
- "tmux not found" - installation instructions by platform
- "Failed to reconnect" - cleanup orphaned sessions
- "Performance issues" - adjust scrollback buffer size

### Developer Documentation

- Architecture (this document)
- Type-safe IPC guide (see `docs/TYPE_SAFE_IPC.md`)
- Contributing to terminal features
- tmux control mode protocol reference

## Migration & Rollout

### Rollout Phases

**Alpha (Week 1-2)**: Internal testing
- Core functionality working
- Feature flag enabled for developers only
- Gather feedback on bugs and UX

**Beta (Week 3-4)**: Limited user testing
- Polish UI/UX
- Add session management panel
- Gather user feedback
- Monitor for edge cases

**General Availability (Week 5+)**: Full release
- Enable by default for macOS/Linux
- Full documentation
- Monitor support tickets
- Collect metrics

### Feature Flag Strategy

```typescript
// Settings schema
interface Settings {
  terminal: {
    persistSessions: boolean;      // Master toggle
    autoRestore: boolean;           // Auto-restore on startup
    sessionTTLDays: number;         // Cleanup after N days
    maxOrphanedSessions: number;    // Limit
  }
}

// Gradual rollout
const ROLLOUT_CONFIG = {
  alpha: { enabledByDefault: false, userGroup: 'internal' },
  beta: { enabledByDefault: false, userGroup: 'beta-testers' },
  ga: { enabledByDefault: true, userGroup: 'all' },
};
```

## Future Enhancements

### Phase 5+ (Future Work)

1. **Session Sharing**
   - Share terminal sessions with team members
   - Collaborative debugging
   - Remote pair programming support

2. **Cloud Sync**
   - Sync session metadata across devices
   - Very complex, requires backend infrastructure

3. **Session Templates**
   - Save and restore session configurations
   - Predefined workspace setups
   - "Start dev environment" with multiple terminals

4. **Split Panes**
   - Full tmux pane management
   - Expose tmux splits in UI
   - Synchronized panes

5. **Session Recording**
   - Record and replay terminal sessions
   - Export to video (asciinema format)
   - Share recordings

6. **AI Integration**
   - Analyze terminal output for errors
   - Suggest fixes for common issues
   - Semantic search across terminal history

7. **Advanced tmux Features**
   - Expose tmux keybindings
   - Custom tmux configurations per workspace
   - Window/pane management

## Open Questions

1. **Session TTL**: Should sessions auto-close after N days? Default value?
   - **Recommendation**: Yes, default 7 days, configurable

2. **Max Sessions**: Limit concurrent sessions per workspace?
   - **Recommendation**: Soft limit (warn at 10), hard limit (20)

3. **tmux Keybindings**: Expose to power users?
   - **Recommendation**: Phase 2+, opt-in for advanced users

4. **tmux Version**: Minimum required version?
   - **Recommendation**: tmux 2.6+ (2017), check and warn

5. **Bundle tmux**: Should we bundle tmux with the app?
   - **Recommendation**: No (legal/complexity issues), provide install instructions

6. **Windows Support**: Should we support Windows Terminal integration?
   - **Recommendation**: Future work, focus on Unix-like systems first

## Success Metrics

Track these metrics to measure feature success:

1. **Adoption**: % of users with persistent sessions enabled
2. **Reconnection Success**: % of sessions successfully reconnected after restart
3. **Session Lifetime**: Average session uptime (indicator of usefulness)
4. **Crash Rate**: Sessions lost due to crashes (vs intentional kills)
5. **User Feedback**: NPS score, support tickets, feature requests
6. **Performance**: CPU/memory impact, session count distribution

**Targets**:
- >80% reconnection success rate
- <5% increase in memory usage
- <10 support tickets per 1000 users
- Average session lifetime >1 hour (indicates usefulness)

## Timeline Estimate

| Phase | Duration | Deliverables |
|-------|----------|--------------|
| Phase 1: Core Integration | 2-3 weeks | tmux utils, control client, session manager, basic IPC |
| Phase 2: Reconnection Logic | 1-2 weeks | Startup flow, restore UI, orphaned session handling |
| Phase 3: UI/UX | 1-2 weeks | Settings panel, status indicators, session management |
| Phase 4: Recovery (Optional) | 1-2 weeks | State-based recovery from reboot |
| Testing & Polish | 1-2 weeks | Bug fixes, edge cases, performance tuning |
| **Total** | **6-11 weeks** | Full feature with optional reboot recovery |

## Conclusion

The tmux-based approach provides the most robust, maintainable solution for persistent terminal sessions:

- **Proven**: Leverages decades of production-tested technology
- **Simple**: Less code to maintain than custom daemon solutions
- **Reliable**: Built-in session management and recovery
- **Flexible**: Supports advanced features (split panes, recording) in future
- **Developer-friendly**: Many users already familiar with tmux

The phased implementation allows for incremental delivery, user feedback, and validation at each step. By starting with core functionality and gradually adding features, we minimize risk while delivering value early.

---

**Related Documentation**:
- [Type-Safe IPC System](./docs/TYPE_SAFE_IPC.md)
- [Desktop App Architecture](./README.md)
- tmux control mode: https://github.com/tmux/tmux/wiki/Control-Mode
