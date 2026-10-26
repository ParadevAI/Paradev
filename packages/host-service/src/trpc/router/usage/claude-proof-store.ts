import { randomUUID } from "node:crypto";
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
import { hashQuotaScope } from "./quota-cooldown-store";
import {
	type ClaudeQuotaProof,
	claudeQuotaProof,
	validClaudeQuotaProof,
} from "./quota-identity";

const MAX_RECORDS = 128;
const MAX_BYTES = 128 * 1024;
type Saved = ClaudeQuotaProof & { key: string; profileHash: string };
const digest = (value: unknown): value is string =>
	typeof value === "string" && /^[a-f0-9]{64}$/.test(value);
function valid(value: unknown, now: number): value is Saved {
	if (!value || typeof value !== "object") return false;
	const row = value as Saved;
	return (
		digest(row.key) &&
		digest(row.profileHash) &&
		validClaudeQuotaProof(row, now)
	);
}
const key = (token: string, canonicalProfile: string) =>
	hashQuotaScope(["claude-display-proof-v1", token, canonicalProfile]);

/** Optional provenance, never credentials or launch authorization. All persisted identity is hashed. */
export function createClaudeProofStore(path?: string, now = () => Date.now()) {
	const entries = new Map<string, Saved>();
	let loaded = false;
	function load() {
		if (loaded) return;
		loaded = true;
		if (!path) return;
		try {
			const parent = lstatSync(dirname(path));
			if (
				!parent.isDirectory() ||
				parent.isSymbolicLink() ||
				(process.platform !== "win32" &&
					(parent.uid !== process.getuid?.() || (parent.mode & 0o022) !== 0))
			)
				return;
			const fd = openSync(
				path,
				constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK,
			);
			let text: string;
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
				text = readFileSync(fd, "utf8");
				if (Buffer.byteLength(text) > MAX_BYTES) return;
			} finally {
				closeSync(fd);
			}
			const state = JSON.parse(text);
			if (
				state?.version !== 1 ||
				!Array.isArray(state.entries) ||
				state.entries.length > MAX_RECORDS
			)
				return;
			for (const row of state.entries)
				if (valid(row, now()))
					entries.set(row.key, {
						key: row.key,
						profileHash: row.profileHash,
						tokenHash: row.tokenHash,
						ownerHash: row.ownerHash,
						registrationHash: row.registrationHash,
						verifiedAt: row.verifiedAt,
					});
		} catch {
			/* An unsafe or unavailable cache grants no provenance. */
		}
	}
	function persist() {
		if (!path) return;
		let temporary: string | undefined;
		try {
			const directory = dirname(path);
			mkdirSync(directory, { recursive: true, mode: 0o700 });
			const info = lstatSync(directory);
			if (
				!info.isDirectory() ||
				info.isSymbolicLink() ||
				(process.platform !== "win32" &&
					(info.uid !== process.getuid?.() || (info.mode & 0o022) !== 0))
			)
				return;
			const rows = [...entries.values()]
				.filter((row) => valid(row, now()))
				.sort((a, b) => b.verifiedAt - a.verifiedAt)
				.slice(0, MAX_RECORDS);
			const text = JSON.stringify({ version: 1, entries: rows });
			if (Buffer.byteLength(text) > MAX_BYTES) return;
			temporary = `${path}.${randomUUID()}.tmp`;
			writeFileSync(temporary, text, { flag: "wx", mode: 0o600 });
			renameSync(temporary, path);
		} catch {
			/* Keep the original in-memory proof if storage is unavailable. */
		} finally {
			if (temporary) {
				try {
					unlinkSync(temporary);
				} catch {}
			}
		}
	}
	function invalidateReplaced(token: string, canonicalProfile: string) {
		const tokenHash = hashQuotaScope(token);
		const profileHash = hashQuotaScope(canonicalProfile);
		let changed = false;
		for (const [identityKey, row] of entries)
			if (row.profileHash === profileHash && row.tokenHash !== tokenHash) {
				entries.delete(identityKey);
				changed = true;
			}
		if (changed) persist();
	}
	return {
		get(token: string, canonicalProfile: string | null) {
			load();
			if (!token.trim() || !canonicalProfile) return null;
			invalidateReplaced(token, canonicalProfile);
			const row = entries.get(key(token, canonicalProfile));
			if (!row || !valid(row, now()) || row.tokenHash !== hashQuotaScope(token))
				return null;
			return {
				tokenHash: row.tokenHash,
				ownerHash: row.ownerHash,
				registrationHash: row.registrationHash,
				verifiedAt: row.verifiedAt,
			};
		},
		remember(
			token: string,
			canonicalProfile: string | null,
			profile: unknown,
			verifiedAt: number,
		) {
			load();
			if (!canonicalProfile) return;
			const proof = claudeQuotaProof(token, profile, verifiedAt);
			if (!proof || !validClaudeQuotaProof(proof, now())) return;
			invalidateReplaced(token, canonicalProfile);
			const identityKey = key(token, canonicalProfile);
			const previous = entries.get(identityKey);
			if (previous && previous.verifiedAt > verifiedAt) return;
			entries.delete(identityKey);
			entries.set(identityKey, {
				key: identityKey,
				profileHash: hashQuotaScope(canonicalProfile),
				...proof,
			});
			while (entries.size > MAX_RECORDS)
				entries.delete(entries.keys().next().value ?? "");
			persist();
		},
		forget(token: string) {
			load();
			const tokenHash = hashQuotaScope(token);
			let changed = false;
			for (const [identityKey, proof] of entries)
				if (proof.tokenHash === tokenHash) {
					entries.delete(identityKey);
					changed = true;
				}
			if (changed) persist();
		},
	};
}
export const claudeProofStore = createClaudeProofStore(
	join(
		process.env.SUPERSET_HOME_DIR?.trim() || join(homedir(), ".superset"),
		"state",
		"claude-display-proofs.json",
	),
);
