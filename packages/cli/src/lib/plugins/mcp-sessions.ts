import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { resolveAppHomeDir } from "@superset/agent-setup/paths";
import { writePrivateJson } from "../config";

// The proxy forgets a session an hour after its last successful use.
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
		const parsed: unknown = JSON.parse(readFileSync(path, "utf8"));
		return parsed && typeof parsed === "object" && !Array.isArray(parsed)
			? (parsed as Record<string, KeptSession>)
			: {};
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
		Object.entries(readSessions()).filter(
			([, entry]) => entry?.expiresAt > now,
		),
	);
	kept[key] = { sessionId, expiresAt: now + KEPT_SESSION_MS };
	writePrivateJson(sessionsPath(), kept);
}
