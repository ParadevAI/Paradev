import { createHash, randomUUID } from "node:crypto";
import {
	closeSync,
	constants,
	fstatSync,
	lstatSync,
	mkdirSync,
	openSync,
	readFileSync,
	renameSync,
	unlinkSync,
	writeFileSync,
} from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";

export type QuotaEndpoint = "usage" | "profile" | "wallet";
export interface QuotaCooldown {
	key: string;
	kind: "rate_limit" | "transient";
	status: number;
	failures: number;
	retryAt: number;
	updatedAt: number;
}
export const hashQuotaScope = (value: unknown) =>
	createHash("sha256").update(JSON.stringify(value)).digest("hex");
const MAX_RECORDS = 1024;
const MAX_BYTES = 512 * 1024;
const MAX_AGE_MS = 7 * 24 * 60 * 60_000;

export function createQuotaCooldownStore(
	path?: string,
	now = () => Date.now(),
) {
	let loaded = false;
	const entries = new Map<string, QuotaCooldown>();
	function load() {
		if (loaded) return;
		loaded = true;
		if (!path) return;
		try {
			const fd = openSync(
				path,
				constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK,
			);
			let contents: string;
			try {
				const info = fstatSync(fd);
				if (
					!info.isFile() ||
					info.nlink !== 1 ||
					info.size > MAX_BYTES ||
					(process.platform !== "win32" &&
						((info.mode & 0o077) !== 0 || info.uid !== process.getuid?.()))
				)
					return;
				contents = readFileSync(fd, "utf8");
				if (Buffer.byteLength(contents) > MAX_BYTES) return;
			} finally {
				closeSync(fd);
			}
			const state: unknown = JSON.parse(contents);
			if (
				!state ||
				typeof state !== "object" ||
				!("version" in state) ||
				state.version !== 1 ||
				!("entries" in state) ||
				!Array.isArray(state.entries) ||
				state.entries.length > MAX_RECORDS
			)
				return;
			for (const value of state.entries) {
				if (
					!value ||
					typeof value !== "object" ||
					!/^[a-f0-9]{64}$/.test(value.key) ||
					!["rate_limit", "transient"].includes(value.kind) ||
					![408, 429, 500, 502, 503, 504, 529].includes(value.status) ||
					!Number.isInteger(value.failures) ||
					value.failures < 1 ||
					value.failures > 8 ||
					!Number.isFinite(value.retryAt) ||
					!Number.isFinite(value.updatedAt) ||
					value.updatedAt < now() - MAX_AGE_MS ||
					value.updatedAt > now() + 60_000 ||
					value.retryAt > value.updatedAt + 24 * 60 * 60_000
				)
					continue;
				entries.set(value.key, value);
			}
		} catch {
			/* Invalid retry metadata never supplies identity or quota authority. */
		}
	}
	function persist() {
		if (!path) return;
		const directory = dirname(path);
		let temporary: string | undefined;
		try {
			mkdirSync(directory, { recursive: true, mode: 0o700 });
			const info = lstatSync(directory);
			if (
				!info.isDirectory() ||
				info.isSymbolicLink() ||
				(process.platform !== "win32" &&
					(info.uid !== process.getuid?.() || (info.mode & 0o022) !== 0))
			)
				return;
			temporary = `${path}.${randomUUID()}.tmp`;
			writeFileSync(
				temporary,
				JSON.stringify({ version: 1, entries: [...entries.values()] }),
				{ flag: "wx", mode: 0o600 },
			);
			renameSync(temporary, path);
		} catch {
			/* In-memory cooldowns remain authoritative if storage is unavailable. */
		} finally {
			if (temporary) {
				try {
					unlinkSync(temporary);
				} catch {}
			}
		}
	}
	return {
		get(key: string) {
			load();
			return entries.get(key);
		},
		set(value: QuotaCooldown) {
			load();
			if (!/^[a-f0-9]{64}$/.test(value.key))
				throw new Error("Invalid quota scope.");
			if (!entries.has(value.key) && entries.size >= MAX_RECORDS) {
				const disposable = [...entries.values()]
					.filter((entry) => entry.retryAt <= now())
					.sort((a, b) => a.updatedAt - b.updatedAt)[0];
				if (!disposable) throw new Error("Usage retry storage is busy.");
				entries.delete(disposable.key);
			}
			entries.set(value.key, { ...value });
			persist();
		},
		clear(key: string) {
			load();
			if (entries.delete(key)) persist();
		},
	};
}

export const quotaCooldownStore = createQuotaCooldownStore(
	join(
		process.env.SUPERSET_HOME_DIR?.trim() || join(homedir(), ".superset"),
		"state",
		"usage-cooldowns.json",
	),
);
