/**
 * Keeps the selected agent accounts provisioned — see
 * packages/agent-setup/src/provider-profiles.ts for what that means. Split
 * from default-account.ts so the terminal's env-resolution path (loaded by
 * node --test) doesn't pull the whole agent-setup surface in.
 */

import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import {
	provisionClaudeProfile,
	provisionCodexProfile,
	resolveAmbientCodexHome,
} from "@superset/agent-setup";
import type { HostDb } from "../../../db/index.ts";
import { getHostWorkerPool } from "../../../workers/host-worker-pool.ts";
import { shareSessionStateTask } from "../../../workers/tasks/accounts.ts";
import {
	getDefaultAccountSelections,
	syncDefaultAccountPointers,
} from "./default-account.ts";

/**
 * Everything a Claude account needs on this host: the shared session state
 * (one `--resume` history across accounts — session-share.ts) plus the
 * config surfaces agent-setup owns (skills, plugins, settings, MCP servers).
 */
export async function provisionClaudeAccount(configDir: string): Promise<void> {
	await shareSessionState("claude", configDir, join(homedir(), ".claude"));
	await provisionClaudeProfile(configDir);
}

/**
 * The Codex twin. Both agents get session sharing: an account switch that
 * keeps `--resume` for Claude but drops `codex resume` is the same bug twice.
 * The share target is the same home `discoverCodexHomes` calls the system
 * default, so the account the UI labels default is the one sessions pool into.
 */
export async function provisionCodexAccount(codexHome: string): Promise<void> {
	await shareSessionState("codex", codexHome, resolveAmbientCodexHome());
	await provisionCodexProfile(codexHome);
}

let shareQueue: Promise<void> = Promise.resolve();

/** Runs one share at a time: two moves into the same home could each see a
 * path free and then overwrite each other's file. Never throws; an
 * interrupted share finishes on the next run. */
function shareSessionState(
	agent: "claude" | "codex",
	profileDir: string,
	mainHome: string,
): Promise<void> {
	shareQueue = shareQueue.then(() =>
		getHostWorkerPool()
			.run(
				shareSessionStateTask,
				{ agent, profileDir, mainHome },
				{ timeoutMs: 10 * 60 * 1000 },
			)
			.catch((error) => {
				console.warn(
					`[host-service] sharing session state for ${profileDir} failed:`,
					error,
				);
			}),
	);
	return shareQueue;
}

/**
 * Re-shares the default account's config into whichever profiles are
 * currently selected. Runs at host boot so a profile keeps up with skills,
 * plugins, and settings added since it was selected, and so one provisioned
 * by an older build — or by a switch that failed halfway — is repaired
 * before the next agent launches on it.
 */
export async function provisionSelectedAccounts(db: HostDb): Promise<void> {
	// Heal the wrapper pointer files first — a build predating them (or a
	// crashed switch) leaves agents launching on a stale spawn-time default.
	syncDefaultAccountPointers(db);
	const { claudeConfigDir, codexHome } = getDefaultAccountSelections(db);
	const targets: Array<readonly [string, () => Promise<unknown>]> = [];
	// A pointer at a vanished dir is skipped, not recreated: agent launches
	// already fall back to the system-default login in that case.
	if (claudeConfigDir && existsSync(claudeConfigDir)) {
		targets.push([
			claudeConfigDir,
			() => provisionClaudeAccount(claudeConfigDir),
		]);
	}
	if (codexHome && existsSync(codexHome)) {
		targets.push([codexHome, () => provisionCodexAccount(codexHome)]);
	}
	for (const [dir, provision] of targets) {
		try {
			await provision();
		} catch (error) {
			console.warn(
				`[host-service] provisioning the selected account ${dir} failed (continuing):`,
				error,
			);
		}
	}
}
