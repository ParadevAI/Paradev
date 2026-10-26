import { constants, lstatSync, realpathSync, statSync } from "node:fs";
import { lstat, open, readdir, realpath, stat } from "node:fs/promises";
import { isAbsolute, join } from "node:path";
import { MAX_TRANSCRIPT_BYTES, validateNativeConversation } from "./native";

const MAX_DIRECTORIES = 5000;

export interface AccountResumeHistory {
	path: string;
	device: number;
	inode: number;
	size: number;
	modifiedAt: number;
	changedAt: number;
	sha256: string;
	storeBindings?: Array<{ path: string; canonical: string }>;
}

export function assertNativeResumeHistoryCurrent(
	history: AccountResumeHistory,
): void {
	const file = lstatSync(history.path);
	if (
		!file.isFile() ||
		realpathSync(history.path) !== history.path ||
		file.dev !== history.device ||
		file.ino !== history.inode ||
		file.size !== history.size ||
		file.mtimeMs !== history.modifiedAt ||
		file.ctimeMs !== history.changedAt ||
		history.storeBindings?.some(
			(binding) =>
				realpathSync(binding.path) !== binding.canonical ||
				!statSync(binding.path).isDirectory(),
		)
	)
		refuse();
}

function refuse(): never {
	throw new Error("Saved history unavailable");
}

export interface NativeResumeHistoryInput {
	provider: "claude" | "codex";
	sourceDirectory: string;
	targetDirectory: string;
	sessionId: string;
	cwd: string;
}

async function sharedDirectory(
	source: string,
	target: string,
	name: string,
): Promise<string> {
	const [left, right] = await Promise.all([
		realpath(join(source, name)),
		realpath(join(target, name)),
	]);
	if (left !== right || !(await stat(left)).isDirectory()) refuse();
	return left;
}

async function exactSessionFile(
	root: string,
	provider: "claude" | "codex",
	sessionId: string,
): Promise<string> {
	const codexFilename = new RegExp(
		`-${sessionId}(?:_[\\w-]+)?\\.jsonl(?:\\.zst)?$`,
	);
	const pending = [root];
	const matches: string[] = [];
	let visited = 0;
	while (pending.length > 0) {
		if (++visited > MAX_DIRECTORIES) refuse();
		const directory = pending.pop();
		if (!directory) break;
		const entries = await readdir(directory, { withFileTypes: true });
		for (const entry of entries) {
			const path = join(directory, entry.name);
			const nameMatches =
				provider === "claude"
					? entry.name === `${sessionId}.jsonl`
					: codexFilename.test(entry.name);
			if (nameMatches) {
				if (!entry.isFile() || entry.name.endsWith(".zst")) refuse();
				matches.push(path);
				if (matches.length > 1) refuse();
			} else if (entry.isSymbolicLink()) {
				// Only the shared store root may be a link. Nested aliases can
				// hide another copy from a bounded directory walk.
				refuse();
			} else if (
				entry.isDirectory() &&
				(provider !== "claude" || directory === root)
			) {
				pending.push(path);
			}
		}
	}
	if (matches.length !== 1) refuse();
	return matches[0] as string;
}

export async function inspectNativeResumeHistory(
	input: NativeResumeHistoryInput,
): Promise<AccountResumeHistory | null> {
	return inspectNativeResumeHistoryWithReader(input, open);
}

export async function inspectNativeResumeHistoryWithReader(
	input: NativeResumeHistoryInput,
	openFile: typeof open,
): Promise<AccountResumeHistory | null> {
	const { provider, sourceDirectory, targetDirectory, sessionId, cwd } = input;
	if (
		!isAbsolute(sourceDirectory) ||
		!isAbsolute(targetDirectory) ||
		!/^[\w-]+$/.test(sessionId)
	)
		return null;
	try {
		const root = await sharedDirectory(
			sourceDirectory,
			targetDirectory,
			provider === "claude" ? "projects" : "sessions",
		);
		const storeBindings = [sourceDirectory, targetDirectory].map((profile) => ({
			path: join(profile, provider === "claude" ? "projects" : "sessions"),
			canonical: root,
		}));
		if (provider === "codex") {
			// Native Codex writer ownership is scoped to this directory, not
			// the rollout tree: codex-rs/rollout/src/writer_lock.rs.
			const lockRoot = await sharedDirectory(
				sourceDirectory,
				targetDirectory,
				"thread-writer-locks",
			);
			storeBindings.push(
				...[sourceDirectory, targetDirectory].map((profile) => ({
					path: join(profile, "thread-writer-locks"),
					canonical: lockRoot,
				})),
			);
		}
		const path = await exactSessionFile(root, provider, sessionId);
		const file = await openFile(
			path,
			constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK,
		);
		try {
			const before = await file.stat();
			if (
				!before.isFile() ||
				before.size === 0 ||
				before.size > MAX_TRANSCRIPT_BYTES
			)
				refuse();
			const buffer = Buffer.alloc(before.size);
			let offset = 0;
			while (offset < buffer.length) {
				const { bytesRead } = await file.read(
					buffer,
					offset,
					Math.min(64 * 1024, buffer.length - offset),
					offset,
				);
				if (!bytesRead) refuse();
				offset += bytesRead;
			}
			const content = new TextDecoder("utf-8", {
				fatal: true,
				ignoreBOM: true,
			}).decode(buffer);
			const evidence = validateNativeConversation(
				{ provider, sessionId, cwd: await realpath(cwd) },
				[{ canonicalPath: path, content, complete: true }],
			);
			if (!evidence.ok) refuse();
			const after = await file.stat();
			const named = await lstat(path);
			if (
				before.size !== after.size ||
				before.mtimeMs !== after.mtimeMs ||
				before.ctimeMs !== after.ctimeMs ||
				!named.isFile() ||
				named.dev !== after.dev ||
				named.ino !== after.ino ||
				named.size !== after.size ||
				named.mtimeMs !== after.mtimeMs ||
				named.ctimeMs !== after.ctimeMs ||
				(await realpath(path)) !== path ||
				!(
					await Promise.all(
						storeBindings.map(
							async (binding) =>
								(await realpath(binding.path)) === binding.canonical &&
								(await stat(binding.path)).isDirectory(),
						),
					)
				).every(Boolean)
			)
				refuse();
			return {
				path,
				device: after.dev,
				inode: after.ino,
				size: after.size,
				modifiedAt: after.mtimeMs,
				changedAt: after.ctimeMs,
				sha256: evidence.value.sha256,
				storeBindings,
			};
		} finally {
			await file.close();
		}
	} catch {
		return null;
	}
}
