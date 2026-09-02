#!/bin/bash
set -uo pipefail

log() { printf '[internal-setup] %s\n' "$1"; }

CONFIG_REPO="${SUPERSET_INTERNAL_CONFIG_REPO:-https://github.com/saddlepaddle/config.git}"
CONFIG_DIR="$HOME/code/config"

export DEBIAN_FRONTEND=noninteractive
apt-get update -qq
apt-get install -y -qq --no-install-recommends \
  zsh tmux fzf silversearcher-ag neovim >/dev/null
log "shell tooling installed"

apt-get install -y -qq --no-install-recommends \
  libgtk-3-0 libnotify4 libnss3 libxss1 libxtst6 xdg-utils \
  libatspi2.0-0 libsecret-1-0 libgbm1 libasound2 libdrm2 libxkbcommon0 \
  >/dev/null 2>&1 && log "electron runtime libraries installed" \
  || log "electron libraries failed (desktop dev will not start)"

if [ ! -d "$HOME/.oh-my-zsh" ]; then
  sh -c "$(curl -fsSL https://raw.githubusercontent.com/ohmyzsh/ohmyzsh/master/tools/install.sh)" \
    "" --unattended >/dev/null 2>&1
  log "oh-my-zsh installed"
fi

if [ -d "$CONFIG_DIR/.git" ]; then
  git -C "$CONFIG_DIR" pull --ff-only >/dev/null 2>&1 && log "config repo updated"
else
  mkdir -p "$(dirname "$CONFIG_DIR")"
  git clone --depth 1 "$CONFIG_REPO" "$CONFIG_DIR" >/dev/null 2>&1 &&
    log "config repo cloned"
fi

ZSH_CUSTOM="$HOME/.oh-my-zsh/custom"
for plugin in zsh-autosuggestions zsh-syntax-highlighting; do
  if [ ! -d "$ZSH_CUSTOM/plugins/$plugin" ]; then
    git clone --depth 1 "https://github.com/zsh-users/$plugin" \
      "$ZSH_CUSTOM/plugins/$plugin" >/dev/null 2>&1 && log "$plugin installed"
  fi
done

if [ -d "$CONFIG_DIR/zsh/themes" ]; then
  mkdir -p "$ZSH_CUSTOM/themes"
  cp "$CONFIG_DIR"/zsh/themes/*.zsh-theme "$ZSH_CUSTOM/themes/" 2>/dev/null &&
    log "themes installed from config repo"
fi

if ! grep -qs "code/config/zsh/config.zsh" "$HOME/.zshrc" 2>/dev/null; then
  cat >> "$HOME/.zshrc" <<'ZRC'
export ZSH="$HOME/.oh-my-zsh"
[ -f "$HOME/code/config/zsh/config.zsh" ] && source "$HOME/code/config/zsh/config.zsh"
ZRC
  log ".zshrc wired to config repo"
fi

if command -v zsh >/dev/null && [ "$(getent passwd root | cut -d: -f7)" != "$(command -v zsh)" ]; then
  chsh -s "$(command -v zsh)" root
  log "login shell set to zsh"
fi

WORKSPACE="${SUPERSET_SANDBOX_WORKSPACE_PATH:-/workspace}"
MONOREPO="${SUPERSET_INTERNAL_MONOREPO_URL:-https://github.com/superset-sh/superset.git}"
if [ ! -d "$WORKSPACE/.git" ]; then
  mkdir -p "$WORKSPACE"
  if git clone --filter=blob:none --no-checkout "$MONOREPO" "$WORKSPACE" >/dev/null 2>&1; then
    git -C "$WORKSPACE" checkout main >/dev/null 2>&1
    log "monorepo warmed at $WORKSPACE"
  else
    log "monorepo clone failed (workspace will clone on first boot)"
  fi
fi

if [ -d "$WORKSPACE/.git" ] && [ ! -d "$WORKSPACE/node_modules" ]; then
  if command -v bun >/dev/null; then
    log "installing dependencies (several minutes)"
    if (cd "$WORKSPACE" && bun install --frozen-lockfile >/dev/null 2>&1); then
      log "dependencies installed"
    else
      log "bun install failed — run it by hand in the workspace"
    fi
  else
    log "bun not found; skipping dependency install"
  fi
fi

log "done"
