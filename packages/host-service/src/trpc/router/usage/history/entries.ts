import { realpath } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import { discoverClaudeProfiles, discoverCodexHomes } from "../profiles";
import { collectAgyEntries } from "./agy";
import { collectCopilotEntries } from "./copilot";
import { collectDevinEntries } from "./devin";
import { collectFxEntries } from "./fx";
import { collectGrokEntries, grokHomes } from "./grok";
import { collectHermesEntries } from "./hermes";
import { hermesHomes } from "./hermes-homes";
import { LineFileCache, parseWholeFile } from "./line-cache";
import { collectLogFiles, dedupeLogFiles } from "./logs";
import { collectMuseEntries } from "./muse";
import { collectOpencodeEntries } from "./opencode";
import type { UsageLogEntry } from "./parse";
import {
	appendSessionFile,
	type ClaudeFileResult,
	type CodexFileState,
	claudeFileParser,
	codexFileParser,
	sessionIdForFile,
} from "./parse";
import { collectPiEntries } from "./pi";
import { MemoryStateStore, type UsageStateStore } from "./usage-store";

export interface CollectedUsage {
	entries: UsageLogEntry[];

	sessionLabels: Map<string, string>;

	scannedFiles: number;
}

/** Parse state kept between scans, so a scan reads only what changed. */
export interface UsageScanCaches {
	store: UsageStateStore;
	lines: LineFileCache;
}

export function createUsageScanCaches(
	store: UsageStateStore = new MemoryStateStore(),
): UsageScanCaches {
	return { store, lines: new LineFileCache(store) };
}

export interface CollectUsageOptions {
	caches?: UsageScanCaches;
}

/** Every agent read from local files. Cursor has no local token counts; its
 * collector runs per request (see usage-index.ts). */
export async function collectUsageEntries(
	days: number,
	cutoffMs: number,
	options: CollectUsageOptions = {},
): Promise<CollectedUsage> {
	const home = homedir();

	// Same homes the quota discovery covers: the default locations, any
	// CLAUDE_CONFIG_DIR entries (comma-list), and auto-discovered profile /
	// CODEX_HOME dirs — a custom config dir keeps its transcripts INSIDE the
	// dir, so multi-account history means scanning every profile's projects/.
	const claudeHomes = new Set<string>([
		join(home, ".claude"),
		join(home, ".config", "claude"),
	]);
	for (const dir of (process.env.CLAUDE_CONFIG_DIR ?? "").split(",")) {
		if (dir.trim()) claudeHomes.add(dir.trim());
	}
	const [claudeProfiles, codexHomes] = await Promise.all([
		discoverClaudeProfiles(),
		discoverCodexHomes(),
	]);
	for (const profile of claudeProfiles) claudeHomes.add(profile.configDir);

	// Shared-history profiles symlink their projects/ into ~/.claude (see
	// session-share.ts), so two homes can name the same tree under different
	// paths — resolve every scan root and dedupe by real path, or the tree
	// gets walked and parsed once per profile.
	const resolveRoots = async (roots: string[]): Promise<string[]> => {
		const resolved = await Promise.all(
			roots.map(async (root) => {
				try {
					return await realpath(root);
				} catch {
					return null; // Dir absent — collectLogFiles would find nothing.
				}
			}),
		);
		return [
			...new Set(resolved.filter((root): root is string => root !== null)),
		];
	};
	const [claudeRoots, codexRoots] = await Promise.all([
		resolveRoots([...claudeHomes].map((root) => join(root, "projects"))),
		resolveRoots(
			codexHomes.map((codexHome) => join(codexHome.home, "sessions")),
		),
	]);
	const [claudeFileGroups, codexFileGroups] = await Promise.all([
		Promise.all(claudeRoots.map((root) => collectLogFiles(root, days + 1))),
		Promise.all(codexRoots.map((root) => collectLogFiles(root, days + 1))),
	]);
	const claudeFiles = dedupeLogFiles(claudeFileGroups.flat());
	const codexFiles = dedupeLogFiles(codexFileGroups.flat());

	const parseLines = options.caches?.lines.parse ?? parseWholeFile;
	const sqliteStates = options.caches?.store;
	const entries: UsageLogEntry[] = [];
	const claudeEntriesByMessage = new Map<string, UsageLogEntry>();
	const sessionLabels = new Map<string, string>();
	for (const file of claudeFiles) {
		const { byMessage, unkeyed, label } = await parseLines(
			"claude",
			file.path,
			(state?: ClaudeFileResult) => claudeFileParser(file, state),
			cutoffMs,
		);
		appendSessionFile(
			{ entries: unkeyed, label },
			sessionIdForFile(file.path),
			cutoffMs,
			entries,
			sessionLabels,
		);
		for (const key in byMessage) {
			const entry = byMessage[key];
			if (entry && entry.timestampMs >= cutoffMs) {
				claudeEntriesByMessage.set(key, entry);
			}
		}
	}
	// Appended one at a time — spreading into push() passes every entry as a
	// call argument, which throws RangeError past V8's argument limit on
	// machines with a large enough usage history.
	for (const entry of claudeEntriesByMessage.values()) {
		entries.push(entry);
	}
	for (const file of codexFiles) {
		const result = await parseLines(
			"codex",
			file.path,
			(state?: CodexFileState) => codexFileParser(file, state),
			cutoffMs,
		);
		appendSessionFile(
			result,
			sessionIdForFile(file.path),
			cutoffMs,
			entries,
			sessionLabels,
		);
	}

	// The remaining agents are independent of each other and of the two
	// above; each contributes into its own array so concurrent pushes can't
	// interleave, and one agent's failure never takes down the rest.
	let extraScannedFiles = 0;
	const collectors: Array<{
		run: (out: UsageLogEntry[]) => Promise<number | undefined>;
	}> = [
		{
			run: (out: UsageLogEntry[]) =>
				collectAgyEntries(cutoffMs, out, sessionLabels, parseLines),
		},
		...grokHomes().map((grokHome) => ({
			run: (out: UsageLogEntry[]) =>
				collectGrokEntries(grokHome, cutoffMs, out, sessionLabels, parseLines),
		})),
		{
			run: (out: UsageLogEntry[]) =>
				collectOpencodeEntries(
					cutoffMs,
					out,
					sessionLabels,
					undefined,
					sqliteStates,
				),
		},
		{
			run: (out: UsageLogEntry[]) =>
				collectPiEntries(
					"pi",
					days,
					cutoffMs,
					out,
					sessionLabels,
					undefined,
					parseLines,
				),
		},
		{
			run: (out: UsageLogEntry[]) =>
				collectPiEntries(
					"omp",
					days,
					cutoffMs,
					out,
					sessionLabels,
					undefined,
					parseLines,
				),
		},
		{
			run: (out: UsageLogEntry[]) =>
				collectFxEntries(cutoffMs, out, undefined, parseLines),
		},
		{
			run: (out: UsageLogEntry[]) =>
				collectMuseEntries(
					days,
					cutoffMs,
					out,
					sessionLabels,
					undefined,
					parseLines,
				),
		},
		{
			run: (out: UsageLogEntry[]) =>
				collectCopilotEntries(
					cutoffMs,
					out,
					sessionLabels,
					undefined,
					sqliteStates,
				),
		},
		{
			run: (out: UsageLogEntry[]) =>
				collectDevinEntries(
					cutoffMs,
					out,
					sessionLabels,
					undefined,
					sqliteStates,
				),
		},
		...hermesHomes().map((hermesHome) => ({
			run: (out: UsageLogEntry[]) =>
				Promise.resolve(
					collectHermesEntries(hermesHome, cutoffMs, out, sessionLabels),
				),
		})),
	];
	const results = await Promise.allSettled(
		collectors.map(async ({ run }) => {
			const out: UsageLogEntry[] = [];
			const scanned = await run(out);
			return { out, scanned: scanned ?? 0 };
		}),
	);
	for (const result of results) {
		if (result.status !== "fulfilled") continue;
		extraScannedFiles += result.value.scanned;
		for (const entry of result.value.out) {
			entries.push(entry);
		}
	}

	return {
		entries,
		sessionLabels,
		scannedFiles: claudeFiles.length + codexFiles.length + extraScannedFiles,
	};
}
