import fs from "node:fs";
import path from "node:path";
import {
	buildWrapperScript,
	createWrapper,
	isSupersetManagedHookCommand,
	writeFileIfChanged,
} from "./agent-wrappers-common";
import { getTemplatePath } from "./config";
import {
	ensureManagedJsonHooks,
	getManagedJsonHooksContent,
	type ManagedJsonHooksSpec,
	removeManagedJsonHooks,
} from "./managed-json-hooks";
import { getHooksDir, resolveUserHomeDir } from "./paths";

export const AGY_HOOK_SCRIPT_NAME = "agy-hook.sh";

const AGY_HOOK_SIGNATURE = "# Superset agy hook";
const AGY_HOOK_VERSION = "v1";
export const AGY_HOOK_MARKER = `${AGY_HOOK_SIGNATURE} ${AGY_HOOK_VERSION}`;

/** Hook group in hooks.json that holds every entry Superset registers. */
export const AGY_HOOK_NAMESPACE = "superset-notify";

const AGY_DYNAMIC_HOOK_PATH_MARKER = `$SUPERSET_HOME_DIR/hooks/${AGY_HOOK_SCRIPT_NAME}`;

interface AgyHookEntry {
	type?: string;
	command?: string;
	matcher?: string;
	hooks?: Array<{ type: string; command: string; [key: string]: unknown }>;
	[key: string]: unknown;
}

export function getAgyHookScriptPath(): string {
	return path.join(getHooksDir(), AGY_HOOK_SCRIPT_NAME);
}

export function getAgyHooksJsonPath(): string {
	return path.join(resolveUserHomeDir(), ".gemini", "config", "hooks.json");
}

export function getAgyHookScriptContent(): string {
	const template = fs.readFileSync(
		getTemplatePath("agy-hook.template.sh"),
		"utf-8",
	);
	return template.replace("{{MARKER}}", AGY_HOOK_MARKER);
}

/**
 * Shell command registered for one agy event. The script path resolves from
 * SUPERSET_HOME_DIR at run time, and `{}` is printed when it is absent so agy
 * always receives valid JSON, including outside Superset terminals.
 */
export function getAgyManagedHookCommand(event: string): string {
	return `[ -n "$SUPERSET_HOME_DIR" ] && [ -x "${AGY_DYNAMIC_HOOK_PATH_MARKER}" ] && "${AGY_DYNAMIC_HOOK_PATH_MARKER}" ${event} || printf '{}\\n'`;
}

function isManagedAgyCommand(command: string | undefined): boolean {
	return Boolean(
		command?.includes(AGY_DYNAMIC_HOOK_PATH_MARKER) ||
			command?.includes(getAgyHookScriptPath()) ||
			isSupersetManagedHookCommand(command, AGY_HOOK_SCRIPT_NAME),
	);
}

function agyHooksSpec(): ManagedJsonHooksSpec<AgyHookEntry> {
	const flatEntry = (event: string): AgyHookEntry => ({
		type: "command",
		command: getAgyManagedHookCommand(event),
	});
	return {
		fileLabel: "Antigravity hooks.json",
		agentLabel: "Antigravity",
		getFilePath: getAgyHooksJsonPath,
		eventsContainerKey: AGY_HOOK_NAMESPACE,
		desiredEntriesByEvent: {
			SessionStart: [flatEntry("SessionStart")],
			PreInvocation: [flatEntry("PreInvocation")],
			PostToolUse: [
				{
					matcher: ".*",
					hooks: [
						{
							type: "command",
							command: getAgyManagedHookCommand("PostToolUse"),
						},
					],
				},
			],
			Stop: [flatEntry("Stop")],
		},
		// The namespace belongs to Superset, so an entry carrying our command
		// is dropped whole in either shape.
		cleanEntry: (entry) =>
			isManagedAgyCommand(entry.command) ||
			entry.hooks?.some((hook) => isManagedAgyCommand(hook.command))
				? null
				: entry,
		dropEmptyContainerOnRemove: true,
	};
}

export function getAgyHooksJsonContent(): string | null {
	return getManagedJsonHooksContent(agyHooksSpec());
}

export function createAgyHookScript(): void {
	const changed = writeFileIfChanged(
		getAgyHookScriptPath(),
		getAgyHookScriptContent(),
		0o755,
	);
	console.log(
		`[agent-setup] ${changed ? "Updated" : "Verified"} Antigravity hook script`,
	);
}

export function createAgyWrapper(): void {
	createWrapper(
		"agy",
		buildWrapperScript("agy", 'exec "$REAL_BIN" "$@"', { agentId: "agy" }),
	);
}

export function createAgyHooksJson(): void {
	ensureManagedJsonHooks(agyHooksSpec());
}

/**
 * Removes the Superset hook group from ~/.gemini/config/hooks.json,
 * preserving every other namespace. No-op when the file does not exist.
 */
export function removeAgyManagedHooks(): void {
	removeManagedJsonHooks(agyHooksSpec());
}
