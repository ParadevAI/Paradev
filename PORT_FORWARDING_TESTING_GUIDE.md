# Port Forwarding - Testing Guide

## Important: How It Works

The port forwarding system **does NOT make your dev servers run on the canonical ports**. Instead:

1. **Dev servers run on their default ports** (e.g., 5173 for Vite, 3000 for Next.js)
2. **Proxy listens on canonical ports** (e.g., 3000, 3001, 3002)
3. **Proxy routes traffic** from canonical → actual port

**Example Flow:**
```
Browser: http://localhost:3000
    ↓
Proxy (listening on 3000)
    ↓
Routes to Worktree A's dev server: http://localhost:5173
```

## Setup

### 1. Configure Ports in Workspace

Edit `~/.superset/config.json`:

```json
{
  "workspaces": [{
    "id": "your-workspace-uuid",
    "name": "superset",
    "ports": [
      { "name": "website", "port": 3000 }
    ]
  }]
}
```

**To find your workspace ID:**
```bash
cat ~/.superset/config.json | grep -A 5 '"name": "superset"'
```

### 2. Restart the App

The app needs to restart to load the port configuration.

## Testing Scenario 1: Single Worktree

### Step 1: Switch to a Worktree

In the app, switch to your main worktree. You should see logs:

```
[WorkspaceOps] Starting port monitoring for worktree main
[WorkspaceOps] Monitoring terminal Terminal 1 (abc-123)
```

### Step 2: Run Dev Server

In a terminal tab within that worktree:

```bash
cd apps/website
bun dev
```

**Expected:** Vite starts on its default port (5173 or similar)

### Step 3: Wait for Detection (2-4 seconds)

Watch the console for:

```
[PortDetector] Detected port 5173 (website) in terminal abc-123
[Main] Port detected: 5173 (website) in worktree xyz-456
[Main] Updated proxy targets for active worktree main
[ProxyManager] Port 3000 (website) → 5173
```

### Step 4: Test Proxy

**In a separate terminal (outside the app):**

```bash
curl http://localhost:3000
```

**Expected:** Should return your website's HTML

**In your browser:**

```bash
open http://localhost:3000
```

**Expected:** Should show your website

### Step 5: Test HMR

1. Make a code change in `apps/website/src/...`
2. Save the file
3. Browser should hot-reload automatically

**Expected:** Changes appear without full page reload

### Step 6: Check UI Indicator

In the sidebar, under your worktree, you should see:

```
🟢 :3000→:5173 (website)
```

## Testing Scenario 2: Multiple Worktrees

### Step 1: Start Dev Server in Worktree A

```bash
# In Worktree A
cd apps/website
bun dev
# Runs on port 5173
```

**Proxy:** `localhost:3000` → `localhost:5173`

### Step 2: Test Access

```bash
curl http://localhost:3000
# Shows Worktree A's content
```

### Step 3: Start Dev Server in Worktree B

**Important:** Don't stop Worktree A's server

```bash
# In Worktree B
cd apps/website
bun dev
# Runs on port 5174 (next available)
```

### Step 4: Switch to Worktree B

In the app, click on Worktree B to make it active.

**Expected logs:**

```
[WorkspaceOps] Starting port monitoring for worktree feature-branch
[PortDetector] Detected port 5174 (website) in terminal def-456
[ProxyManager] Port 3000 (website) → 5174
```

### Step 5: Test Proxy Switched

```bash
curl http://localhost:3000
# Now shows Worktree B's content
```

**Refresh browser:** Should show Worktree B's content

### Step 6: Switch Back to Worktree A

Click on Worktree A in the sidebar.

**Expected:**
- Proxy updates: `localhost:3000` → `localhost:5173`
- Browser shows Worktree A's content again

## Troubleshooting

### Problem: "Port 3000 is already in use"

**Cause:** Your dev server is trying to bind to port 3000 directly

**Solution:** The dev server should use its default port. Check if you have:
- Environment variable `PORT=3000` set
- Script parameter like `--port 3000`
- Config file specifying port 3000

**Fix:** Remove any port configuration from your dev scripts

### Problem: No Ports Detected

**Check:**
1. Is workspace configured with `ports` in config.json?
2. Did you switch to the worktree (to trigger monitoring)?
3. Is dev server actually running?
4. Check console logs for errors

**Debug:**
```bash
# Check if lsof works
lsof -Pan -i4TCP -sTCP:LISTEN | grep node

# Check process tree
ps aux | grep "bun dev"
```

### Problem: Proxy Not Routing

**Check:**
1. Is proxy initialized? Look for `[ProxyManager] Initialized` log
2. Is worktree active? Only active worktree gets routed
3. Are ports detected? Check `worktree.detectedPorts` in config

**Debug:**
```typescript
// In renderer dev tools console
const status = await window.ipcRenderer.invoke('proxy-get-status');
console.log(status);
```

### Problem: Port Detected but Wrong Service Name

**Cause:** Service name is detected from working directory

**Example:**
- Terminal CWD: `~/.superset/worktrees/superset/main/apps/website`
- Extracted service: `website` ✅

**If service name is wrong:**
- Check terminal's working directory
- The system looks for `/apps/{service}` or `/packages/{service}`

### Problem: WebSocket/HMR Not Working

**Check:**
1. Is proxy forwarding WebSocket upgrades?
2. Check browser console for WebSocket errors
3. Verify dev server is using WebSocket (most modern ones do)

**Test WebSocket:**
```javascript
// In browser console
const ws = new WebSocket('ws://localhost:3000');
ws.onopen = () => console.log('Connected!');
ws.onerror = (e) => console.error('Error:', e);
```

## Expected UI Indicators

### Active Worktree with Running Server

```
Worktree: main ⭐
├── 🟢 :3000→:5173 (website)
└── Terminal 1
```

### Inactive Worktree with Detected Ports

```
Worktree: feature-branch
├── 🔴 website:5174
└── Terminal 1
```

### No Ports Detected

```
Worktree: feature-branch
└── Terminal 1
```

## Advanced Testing

### Multiple Services

Configure multiple ports:

```json
{
  "ports": [
    { "name": "website", "port": 3000 },
    { "name": "docs", "port": 3001 }
  ]
}
```

Run servers in both:

```bash
# Terminal 1
cd apps/website && bun dev  # → 5173

# Terminal 2
cd apps/docs && bun dev     # → 5174
```

**Expected:**
- `localhost:3000` → `localhost:5173` (website)
- `localhost:3001` → `localhost:5174` (docs)

### Port Conflict Resolution

If you accidentally have two dev servers trying to use the same port:

1. First one gets the port
2. Second one should fail or use next available
3. Detection should still work for both
4. Only the active worktree's ports are routed

## Performance Notes

- **Port Detection:** Polls every 2 seconds (minimal CPU)
- **Proxy Latency:** ~5-10ms per request
- **WebSocket:** Native passthrough, no performance impact

## Logs to Watch

**Successful Flow:**
```
[WorkspaceOps] Starting port monitoring for worktree main
[WorkspaceOps] Monitoring terminal Terminal 1 (abc-123)
[PortDetector] Detected port 5173 (website) in terminal abc-123
[Main] Port detected: 5173 (website) in worktree xyz-456
[Main] Updated proxy targets for active worktree main
[ProxyManager] Port 3000 (website) → 5173
```

**Error Indicators:**
```
[PortDetector] Error polling ports for terminal xxx
[ProxyManager] Proxy error on port 3000: <error message>
[ProxyManager] Bad Gateway: Unable to connect to backend server
```

## Next Steps After Testing

Once you've verified it works:

1. Configure your preferred canonical ports
2. Add port configs for other services (docs, blog, etc.)
3. Test with your full development workflow
4. Report any issues or unexpected behavior

## Common Mistakes

❌ **Don't:** Configure your dev server to use port 3000
✅ **Do:** Let dev server use default port, proxy handles routing

❌ **Don't:** Try to access dev server's actual port (5173) for development
✅ **Do:** Always use canonical port (3000) for development

❌ **Don't:** Stop and restart dev servers when switching worktrees
✅ **Do:** Let both run simultaneously, proxy routes to active one

❌ **Don't:** Expect instant detection
✅ **Do:** Wait 2-4 seconds for polling to detect ports
