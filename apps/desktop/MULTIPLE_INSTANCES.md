# Running Multiple Dev Instances

This guide explains how to run multiple Electron instances simultaneously for parallel development.

## Quick Start

### Method 1: Using Worktrees (Recommended)

When you create a new worktree via the Superset app, it automatically runs `update-port.sh` which increments the port number in the root `.env`:

```bash
# Worktree 1 - automatically uses port 4927
# Worktree 2 - automatically uses port 4928
# Worktree 3 - automatically uses port 4929
```

Each worktree reads the port from the root `.env` file, which gets incremented automatically during worktree setup.

### Method 2: Manual Script Execution

Run the port update script manually from the monorepo root:

```bash
# Increment port in root .env
./update-port.sh

# Then run dev in desktop app
cd apps/desktop && bun dev
```

### Method 3: Helper Scripts (Advanced)

Override the .env port using environment variables:

```bash
# Terminal 1 - Instance 1 on port 4927
./dev-instance.sh instance1 4927

# Terminal 2 - Instance 2 on port 4928
./dev-instance.sh instance2 4928

# Terminal 3 - Instance 3 on port 4929
./dev-instance.sh instance3 4929
```

### Windows

```powershell
# Terminal 1
.\dev-instance.ps1 instance1 4927

# Terminal 2
.\dev-instance.ps1 instance2 4928
```

## How It Works

Each instance runs with:
- **Separate dev server port** - Configured via `VITE_DEV_SERVER_PORT`
- **Separate user data directory** - Each instance stores settings, cache, and local storage in `~/.superset-dev-{instance-name}`

This allows you to:
- Test different branches simultaneously
- Compare features side-by-side
- Debug without affecting your main development instance
- Test migrations and upgrades

## Manual Setup

If you prefer not to use the helper scripts:

```bash
# Set the port
export VITE_DEV_SERVER_PORT=4928

# Run with custom user data directory
bun dev -- --user-data-dir="$HOME/.superset-dev-custom"
```

## User Data Directories

Each instance stores its data in:
- **macOS/Linux**: `~/.superset-dev-{instance-name}/`
- **Windows**: `%USERPROFILE%\.superset-dev-{instance-name}\`

This includes:
- Application settings
- Local storage
- IndexedDB data
- Cache
- Workspace configurations

## Cleaning Up

To reset an instance, delete its user data directory:

```bash
# macOS/Linux
rm -rf ~/.superset-dev-instance1

# Windows
Remove-Item -Recurse -Force "$env:USERPROFILE\.superset-dev-instance1"
```

## Troubleshooting

### Port already in use
If you see "Port 4927 is already in use", either:
1. Stop the other instance using that port
2. Choose a different port number (4928, 4929, etc.)

### Instances share the same data
Make sure each instance uses a different user data directory. Check that the `--user-data-dir` flag is being passed correctly.

### Changes not reflected
If code changes aren't showing up, make sure you're editing in the correct workspace and that hot reload is working in the terminal running that instance.
