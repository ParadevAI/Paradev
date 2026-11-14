#!/usr/bin/env bash
B="$(dirname "$0")"
if [ -d "$B/../lib/overlayOpenClass" ]; then
  echo 'export { trackOpenOverlays as startOverlayTracking } from "../lib/overlayOpenClass";' > "$B/compat.ts"
else
  echo 'export const startOverlayTracking = () => {};' > "$B/compat.ts"
fi
cat "$B/compat.ts"
