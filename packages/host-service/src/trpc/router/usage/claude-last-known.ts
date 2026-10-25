import { randomUUID } from "node:crypto";
import { constants } from "node:fs";
import {
	lstat,
	mkdir,
	open,
	rename,
	unlink,
	writeFile,
} from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { hashQuotaScope } from "./quota-cooldown-store";
import { claudeProfileIdentity } from "./quota-identity";
import type { UsageAccount, UsageQuotaWindow } from "./types";

const MAX_BYTES = 512 * 1024;
const MAX_RECORDS = 128;
const MAX_AGE_MS = 14 * 24 * 60 * 60_000;
type SavedWindow = Omit<
	UsageQuotaWindow,
	"resetsAt" | "observedAt" | "source"
> & {
	resetsAt: number | null;
	observedAt: number;
	source: "provider";
};
type Saved = { key: string; fetchedAt: number; windows: SavedWindow[] };

function record(value: unknown): Record<string, unknown> | null {
	return value !== null && typeof value === "object" && !Array.isArray(value)
		? (value as Record<string, unknown>)
		: null;
}

function scope(accessToken: string, profile: unknown): string | null {
	const identity = claudeProfileIdentity(profile);
	return identity && accessToken.trim()
		? hashQuotaScope([
				"claude-last-known-v1",
				accessToken,
				hashQuotaScope([identity.principal, identity.organization]),
			])
		: null;
}

function parseSaved(value: unknown, now: number): Saved | null {
	const row = record(value);
	if (
		!row ||
		typeof row.key !== "string" ||
		!/^[a-f0-9]{64}$/.test(row.key) ||
		typeof row.fetchedAt !== "number" ||
		!Number.isFinite(row.fetchedAt) ||
		row.fetchedAt < now - MAX_AGE_MS ||
		row.fetchedAt > now ||
		!Array.isArray(row.windows) ||
		row.windows.length < 1 ||
		row.windows.length > 32
	)
		return null;
	const windows: SavedWindow[] = [];
	for (const value of row.windows) {
		const window = record(value);
		if (
			!window ||
			typeof window.id !== "string" ||
			window.id.length > 128 ||
			typeof window.label !== "string" ||
			window.label.length > 256 ||
			typeof window.usedPercent !== "number" ||
			!Number.isFinite(window.usedPercent) ||
			window.usedPercent < 0 ||
			window.usedPercent > 100 ||
			window.source !== "provider" ||
			typeof window.observedAt !== "number" ||
			!Number.isFinite(window.observedAt) ||
			window.observedAt > row.fetchedAt ||
			window.observedAt < now - MAX_AGE_MS ||
			(window.resetsAt !== null &&
				(typeof window.resetsAt !== "number" ||
					!Number.isFinite(window.resetsAt) ||
					window.resetsAt < 0))
		)
			return null;
		windows.push({
			id: window.id,
			label: window.label,
			usedPercent: window.usedPercent,
			resetsAt: window.resetsAt as number | null,
			observedAt: window.observedAt,
			source: "provider",
		});
	}
	if (new Set(windows.map((window) => window.id)).size !== windows.length)
		return null;
	return { key: row.key, fetchedAt: row.fetchedAt, windows };
}

/** Display history only. A path, display email or replacement token grants no access. */
export function createClaudeLastKnownStore(
	path?: string,
	now = () => Date.now(),
) {
	const entries = new Map<string, Saved>();
	let loaded: Promise<void> | undefined;
	let previous: Promise<unknown> = Promise.resolve();
	async function load() {
		if (!path) return;
		try {
			const file = await open(
				path,
				constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK,
			);
			try {
				const info = await file.stat();
				if (
					!info.isFile() ||
					info.nlink !== 1 ||
					info.size > MAX_BYTES ||
					(process.platform !== "win32" &&
						(info.uid !== process.getuid?.() || (info.mode & 0o077) !== 0))
				)
					return;
				const text = await file.readFile("utf8");
				if (Buffer.byteLength(text) > MAX_BYTES) return;
				const state = record(JSON.parse(text));
				if (
					state?.version !== 1 ||
					!Array.isArray(state.entries) ||
					state.entries.length > MAX_RECORDS
				)
					return;
				for (const value of state.entries) {
					const row = parseSaved(value, now());
					if (row) entries.set(row.key, row);
				}
			} finally {
				await file.close();
			}
		} catch {
			// History is optional and never changes live quota or authentication.
		}
	}
	async function persist() {
		if (!path) return;
		let temporary: string | undefined;
		try {
			const directory = dirname(path);
			await mkdir(directory, { recursive: true, mode: 0o700 });
			const info = await lstat(directory);
			if (
				!info.isDirectory() ||
				info.isSymbolicLink() ||
				(process.platform !== "win32" &&
					(info.uid !== process.getuid?.() || (info.mode & 0o022) !== 0))
			)
				return;
			let rows = [...entries.values()]
				.filter((entry) => parseSaved(entry, now()) !== null)
				.sort((a, b) => b.fetchedAt - a.fetchedAt)
				.slice(0, MAX_RECORDS);
			let text = JSON.stringify({ version: 1, entries: rows });
			while (Buffer.byteLength(text) > MAX_BYTES) {
				rows = rows.slice(0, -1);
				text = JSON.stringify({ version: 1, entries: rows });
			}
			temporary = `${path}.${randomUUID()}.tmp`;
			await writeFile(temporary, text, { flag: "wx", mode: 0o600 });
			await rename(temporary, path);
		} catch {
			// Keep the dated in-memory observation if private storage is unavailable.
		} finally {
			if (temporary) await unlink(temporary).catch(() => {});
		}
	}
	function mutate(operation: () => Promise<void>) {
		const next = previous.then(async () => {
			if (!loaded) loaded = load();
			await loaded;
			await operation();
		});
		previous = next.catch(() => {});
		return next;
	}
	const display = (key: string | null) => {
		const row = key ? entries.get(key) : undefined;
		if (!row || !parseSaved(row, now())) return undefined;
		return {
			fetchedAt: new Date(row.fetchedAt),
			windows: row.windows.map((window) => ({
				...window,
				resetsAt: window.resetsAt === null ? null : new Date(window.resetsAt),
				observedAt: new Date(window.observedAt),
			})),
		};
	};
	return {
		async getVerifiedOwner(accessToken: string, ownerHash: string) {
			await previous;
			if (!loaded) loaded = load();
			await loaded;
			if (!accessToken.trim() || !/^[a-f0-9]{64}$/.test(ownerHash))
				return undefined;
			return display(
				hashQuotaScope(["claude-last-known-v1", accessToken, ownerHash]),
			);
		},
		async get(accessToken: string, profile: unknown) {
			await previous;
			if (!loaded) loaded = load();
			await loaded;
			return display(scope(accessToken, profile));
		},
		remember(
			accessToken: string,
			profile: unknown,
			quota: Pick<UsageAccount, "fetchedAt" | "windows">,
		) {
			return mutate(async () => {
				const key = scope(accessToken, profile);
				if (!key) return;
				const providerWindows = quota.windows.filter(
					(window) => window.source === "provider" && window.observedAt,
				);
				const acquiredAt = Math.max(
					...providerWindows.map(
						(window) => window.observedAt?.getTime() ?? Number.NaN,
					),
				);
				const row = parseSaved(
					{
						key,
						fetchedAt: acquiredAt,
						windows: providerWindows.map((window) => ({
							...window,
							resetsAt: window.resetsAt?.getTime() ?? null,
							observedAt:
								window.observedAt?.getTime() ?? quota.fetchedAt.getTime(),
							source: "provider",
						})),
					},
					now(),
				);
				if (!row) return;
				if ((entries.get(key)?.fetchedAt ?? -1) > row.fetchedAt) return;
				entries.delete(key);
				entries.set(key, row);
				while (entries.size > MAX_RECORDS)
					entries.delete(entries.keys().next().value ?? "");
				await persist();
			});
		},
		forgetVerifiedOwner(accessToken: string, ownerHash: string) {
			return mutate(async () => {
				if (!accessToken.trim() || !/^[a-f0-9]{64}$/.test(ownerHash)) return;
				const key = hashQuotaScope([
					"claude-last-known-v1",
					accessToken,
					ownerHash,
				]);
				if (entries.delete(key)) await persist();
			});
		},
		forget(accessToken: string, profile: unknown) {
			return mutate(async () => {
				const key = scope(accessToken, profile);
				if (key && entries.delete(key)) await persist();
			});
		},
	};
}

export const claudeLastKnown = createClaudeLastKnownStore(
	join(
		process.env.SUPERSET_HOME_DIR?.trim() || join(homedir(), ".superset"),
		"state",
		"claude-last-known.json",
	),
);
