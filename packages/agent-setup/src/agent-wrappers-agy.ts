import path from "node:path";
import {
	buildWrapperScript,
	createWrapper,
	DYNAMIC_NOTIFY_PATH_MARKER,
	getManagedNotifyHookCommand,
} from "./agent-wrappers-common";
import {
	ensureManagedJsonHooks,
	getManagedJsonHooksContent,
	type ManagedJsonHooksSpec,
	removeManagedJsonHooks,
} from "./managed-json-hooks";
import { resolveUserHomeDir } from "./paths";

/** Named hook set in agy's hooks.json; the file is keyed by these names. */
export const AGY_HOOKS_NAME = "superset-status";

/**
 * agy event → lifecycle event the notify script sends. agy's payload names no
 * event, so the command carries it. PreInvocation fires before every model
 * call, so it re-asserts working after a tool call or an approval. PreToolUse
 * is absent: it must return a decision, and a hook that prints none denies
 * the tool call.
 */
const AGY_MANAGED_EVENTS = {
	PreInvocation: "Start",
	Stop: "Stop",
} as const;

const AGY_HOOK_TIMEOUT_SECONDS = 10;

interface AgyHookEntry {
	type?: string;
	command?: string;
	[key: string]: unknown;
}

/** User-level hooks file, shared by the agy TUI and its backend. */
export function getAgyHooksJsonPath(): string {
	return path.join(resolveUserHomeDir(), ".gemini", "config", "hooks.json");
}

const agyHooksSpec: ManagedJsonHooksSpec<AgyHookEntry> = {
	fileLabel: "Antigravity hooks.json",
	agentLabel: "Antigravity",
	getFilePath: getAgyHooksJsonPath,
	eventsContainerKey: AGY_HOOKS_NAME,
	desiredEntriesByEvent: Object.fromEntries(
		Object.entries(AGY_MANAGED_EVENTS).map(([agyEvent, eventType]) => [
			agyEvent,
			[
				{
					type: "command",
					command: getManagedNotifyHookCommand("agy", eventType),
					timeout: AGY_HOOK_TIMEOUT_SECONDS,
				},
			],
		]),
	),
	cleanEntry: (entry) =>
		entry.command?.includes(DYNAMIC_NOTIFY_PATH_MARKER) ? null : entry,
	dropEmptyContainerOnRemove: true,
};

export function getAgyHooksJsonContent(): string | null {
	return getManagedJsonHooksContent(agyHooksSpec);
}

export function createAgyHooksJson(): void {
	ensureManagedJsonHooks(agyHooksSpec);
}

export function removeAgyManagedHooks(): void {
	removeManagedJsonHooks(agyHooksSpec);
}

export function createAgyWrapper(): void {
	createWrapper(
		"agy",
		buildWrapperScript("agy", 'exec "$REAL_BIN" "$@"', { agentId: "agy" }),
	);
}
