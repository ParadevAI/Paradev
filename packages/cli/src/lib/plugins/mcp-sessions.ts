import {
	chmodSync,
	existsSync,
	mkdirSync,
	readFileSync,
	writeFileSync,
} from "node:fs";
import { dirname, join } from "node:path";
import { resolveAppHomeDir } from "@superset/agent-setup/paths";

// The proxy forgets a session an hour after its last use.
const KEPT_SESSION_MS = 60 * 60_000;

interface KeptSession {
	sessionId: string;
	expiresAt: number;
}

function sessionsPath(): string {
	return join(resolveAppHomeDir(), "plugin-mcp-sessions.json");
}

function readSessions(): Record<string, KeptSession> {
	const path = sessionsPath();
	if (!existsSync(path)) return {};
	try {
		return JSON.parse(readFileSync(path, "utf8"));
	} catch {
		return {};
	}
}

export function keptSessionId(key: string): string | undefined {
	const kept = readSessions()[key];
	return kept && kept.expiresAt > Date.now() ? kept.sessionId : undefined;
}

export function keepSessionId(key: string, sessionId: string): void {
	const now = Date.now();
	const kept = Object.fromEntries(
		Object.entries(readSessions()).filter(([, entry]) => entry.expiresAt > now),
	);
	kept[key] = { sessionId, expiresAt: now + KEPT_SESSION_MS };
	const path = sessionsPath();
	mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
	writeFileSync(path, JSON.stringify(kept), { mode: 0o600 });
	chmodSync(path, 0o600);
}
