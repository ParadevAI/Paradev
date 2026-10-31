import {
	copyFile,
	lstat,
	mkdtemp,
	realpath,
	rm,
	rmdir,
	stat,
	utimes,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import type {
	TurnChangedFile,
	TurnChanges,
	TurnUndoResult,
} from "@superset/chat-runtime";
import type { SimpleGit } from "simple-git";
import { createUserSimpleGit } from "../../runtime/git/simple-git.ts";
import { defineWorkerTask } from "../define-worker-task.ts";

const GIT_TIMEOUT_MS = 15_000;
const PATH_BATCH = 200;
const REGULAR_FILE_MODES = new Set(["100644", "100755"]);
const CHECKPOINT_IDENTITY = {
	GIT_AUTHOR_NAME: "Superset",
	GIT_AUTHOR_EMAIL: "checkpoints@superset.sh",
	GIT_COMMITTER_NAME: "Superset",
	GIT_COMMITTER_EMAIL: "checkpoints@superset.sh",
};
export const SHARED_TURN_TRAILER = "Superset-Shared-Turn: true";

export type TurnSnapshot = "before" | "after" | "live" | "undone";

function refSegment(id: string): string {
	return id.replace(/[^A-Za-z0-9._-]/g, "_");
}

function turnBase(sessionId: string, turnId: string): string {
	return `refs/superset/chat-turns/${refSegment(sessionId)}/${refSegment(turnId)}`;
}

/**
 * Where a settled turn is also kept: under the agent's own session and the
 * turn's first tool call, both of which survive a resume.
 */
function anchorBase(harnessSessionId: string, anchorItemId: string): string {
	return `refs/superset/chat-turns/by-call/${refSegment(harnessSessionId)}/${refSegment(anchorItemId)}`;
}

export function turnRef(
	sessionId: string,
	turnId: string,
	snapshot: TurnSnapshot,
): string {
	return `${turnBase(sessionId, turnId)}/${snapshot}`;
}

const REPO_LOCATION_VARS = [
	"GIT_DIR",
	"GIT_WORK_TREE",
	"GIT_INDEX_FILE",
	"GIT_COMMON_DIR",
	"GIT_OBJECT_DIRECTORY",
	"GIT_ALTERNATE_OBJECT_DIRECTORIES",
	"GIT_PREFIX",
];

function envWithoutRepoLocation(): NodeJS.ProcessEnv {
	const env = { ...process.env };
	for (const key of REPO_LOCATION_VARS) delete env[key];
	return env;
}

function gitAt(
	cwd: string,
	env?: Record<string, string>,
	abort?: AbortSignal,
): SimpleGit {
	return createUserSimpleGit(cwd, {
		timeout: { block: GIT_TIMEOUT_MS },
		...(abort ? { abort } : {}),
		env: {
			...envWithoutRepoLocation(),
			GIT_OPTIONAL_LOCKS: "0",
			GIT_LITERAL_PATHSPECS: "1",
			...env,
		},
	});
}

type Repo = {
	root: string;
	index: string;
	/** The worktree's own index for snapshots, kept between them. */
	snapshotIndex: string;
	/** The root as the chat's cwd spells it, which git resolves through symlinks. */
	shownRoot: string;
};

async function repoAt(cwd: string): Promise<Repo | null> {
	const [root, index, snapshotIndex] = await gitAt(cwd)
		.raw([
			"rev-parse",
			"--show-toplevel",
			"--git-path",
			"index",
			"--git-path",
			"superset-checkpoint-index",
		])
		.then((out) => out.trim().split("\n"))
		.catch(() => []);
	if (!root || !index || !snapshotIndex) return null;
	const real = await realpath(cwd).catch(() => "");
	const sameFolder = real === root || real.toLowerCase() === root.toLowerCase();
	return {
		root,
		index: resolve(cwd, index),
		snapshotIndex: resolve(cwd, snapshotIndex),
		shownRoot: sameFolder ? cwd.replace(/[\\/]+$/, "") : root,
	};
}

/**
 * Copies the real index, keeping its mtime: with a newer one, git would trust
 * stat data for files edited in the same second as the index was written.
 */
async function seedIndex(from: string, to: string): Promise<void> {
	const copied = await copyFile(from, to).then(
		() => true,
		() => false,
	);
	if (!copied) return;
	const { atime, mtime } = await stat(from);
	await utimes(to, atime, mtime);
}

/**
 * Runs git against a private copy of the index, so the user's staging area,
 * HEAD and branch are never touched.
 */
async function withScratchIndex<T>(
	repo: Repo,
	run: (git: SimpleGit) => Promise<T>,
	abort?: AbortSignal,
): Promise<T> {
	const dir = await mkdtemp(join(tmpdir(), "superset-checkpoint-"));
	const index = join(dir, "index");
	try {
		await seedIndex(repo.index, index);
		return await run(
			gitAt(
				repo.root,
				{ ...CHECKPOINT_IDENTITY, GIT_INDEX_FILE: index },
				abort,
			),
		);
	} finally {
		await rm(dir, { recursive: true, force: true });
	}
}

/**
 * Runs git against the worktree's snapshot index, kept beside the real one so
 * a file git already hashed, untracked ones included, is hashed again only
 * when its stat changes. The host runs one snapshot per worktree at a time; a
 * fresh copy of the real index stands in when the kept one can't be used,
 * such as while another app holds its lock.
 */
async function withSnapshotIndex<T>(
	repo: Repo,
	run: (git: SimpleGit) => Promise<T>,
	abort?: AbortSignal,
): Promise<T> {
	try {
		if (!(await stat(repo.snapshotIndex).catch(() => null))) {
			await seedIndex(repo.index, repo.snapshotIndex);
		}
		return await run(
			gitAt(
				repo.root,
				{ ...CHECKPOINT_IDENTITY, GIT_INDEX_FILE: repo.snapshotIndex },
				abort,
			),
		);
	} catch (error) {
		if (abort?.aborted) throw error;
		await dropIfUnreadable(repo.root, repo.snapshotIndex);
		return withScratchIndex(repo, run, abort);
	}
}

/** A kept index git can no longer read is seeded afresh by the next snapshot. */
async function dropIfUnreadable(root: string, index: string): Promise<void> {
	const readable = await gitAt(root, { GIT_INDEX_FILE: index })
		.raw(["ls-files", "--", ":(exclude)*"])
		.then(
			() => true,
			() => false,
		);
	if (!readable) await rm(index, { force: true });
}

async function readRef(git: SimpleGit, ref: string): Promise<string | null> {
	const sha = await git
		.raw(["rev-parse", "--verify", "--quiet", `${ref}^{commit}`])
		.then((out) => out.trim())
		.catch(() => "");
	return sha || null;
}

/** The worktree as a commit whose parent is HEAD, so a later diff can tell a moved HEAD apart. */
async function snapshotCommit(
	git: SimpleGit,
	message: string,
): Promise<string> {
	await git.raw(["add", "-A"]);
	const tree = (await git.raw(["write-tree"])).trim();
	const head = await readRef(git, "HEAD");
	return (
		await git.raw([
			"commit-tree",
			tree,
			...(head ? ["-p", head] : []),
			"-m",
			message,
		])
	).trim();
}

function nulFields(output: string): string[] {
	return output.split("\0").filter((field) => field.length > 0);
}

function fileStatus(code: string): TurnChangedFile["status"] {
	if (code.startsWith("A")) return "added";
	if (code.startsWith("D")) return "deleted";
	return "modified";
}

async function diffFiles(
	git: SimpleGit,
	from: string,
	to: string,
): Promise<TurnChangedFile[]> {
	const diff = ["diff", "--no-ext-diff", "--no-renames", "-z"];
	const [numstat, nameStatus] = await Promise.all([
		git.raw([...diff, "--numstat", from, to]),
		git.raw([...diff, "--name-status", from, to]),
	]);
	const statusByPath = new Map<string, TurnChangedFile["status"]>();
	const statusFields = nulFields(nameStatus);
	for (let i = 0; i + 1 < statusFields.length; i += 2) {
		statusByPath.set(
			statusFields[i + 1] as string,
			fileStatus(statusFields[i] as string),
		);
	}
	return nulFields(numstat).map((record) => {
		const [additions = "-", deletions = "-", ...rest] = record.split("\t");
		const path = rest.join("\t");
		const binary = additions === "-" || deletions === "-";
		return {
			path,
			status: statusByPath.get(path) ?? "modified",
			additions: binary ? null : Number(additions),
			deletions: binary ? null : Number(deletions),
		};
	});
}

async function changedNames(git: SimpleGit, args: string[]): Promise<string[]> {
	return nulFields(
		await git.raw([...args, "--name-only", "-z", "--no-renames"]),
	);
}

type SnapshotHeads = {
	capturedAt: string;
	/** HEAD when each snapshot was taken; empty on an unborn branch. */
	beforeHead: string;
	afterHead: string;
};

async function snapshotHeads(
	git: SimpleGit,
	before: string,
	after: string,
): Promise<SnapshotHeads> {
	const [beforeLine = "", afterLine = ""] = (
		await git.raw([
			"log",
			"--no-walk=unsorted",
			"--format=%ct %P",
			before,
			after,
		])
	)
		.trim()
		.split("\n");
	const [capturedAt = "", beforeHead = ""] = beforeLine.split(" ");
	const [, afterHead = ""] = afterLine.split(" ");
	return { capturedAt, beforeHead, afterHead };
}

/**
 * When HEAD moved during the turn, the files the turn really touched: those
 * that differed from HEAD in either snapshot, and those in commits made
 * while it ran. Null when HEAD stayed put, so every file counts.
 */
async function authoredPaths(
	git: SimpleGit,
	before: string,
	after: string,
	{ capturedAt, beforeHead, afterHead }: SnapshotHeads,
): Promise<Set<string> | null> {
	if (!beforeHead || !afterHead || beforeHead === afterHead) return null;
	const lists = await Promise.all([
		changedNames(git, ["diff", beforeHead, before]),
		changedNames(git, ["diff", afterHead, after]),
		changedNames(git, [
			"log",
			"--format=",
			`--since=@${capturedAt}`,
			`${beforeHead}..${afterHead}`,
		]),
	]);
	return new Set(lists.flat());
}

/** Files whose turn result HEAD holds now, with nothing left to commit. */
async function committedPaths(
	git: SimpleGit,
	after: string,
	afterHead: string,
	paths: readonly string[],
): Promise<string[]> {
	const head = await readRef(git, "HEAD");
	if (!head || head === afterHead) return [];
	const [differFromResult, uncommitted] = await Promise.all([
		changedNames(git, ["diff", after, head]),
		changedNames(git, ["diff", "HEAD"]),
	]);
	const open = new Set([...differFromResult, ...uncommitted]);
	return paths.filter((path) => !open.has(path));
}

function batches<T>(items: readonly T[]): T[][] {
	const out: T[][] = [];
	for (let i = 0; i < items.length; i += PATH_BATCH) {
		out.push(items.slice(i, i + PATH_BATCH));
	}
	return out;
}

type Entry = { mode: string; oid: string };

/** `<mode> <type> <oid>\t<path>` from ls-tree, `<mode> <oid> <stage>\t<path>` from ls-files. */
function entries(output: string, oidField: 1 | 2): Map<string, Entry> {
	const map = new Map<string, Entry>();
	for (const record of nulFields(output)) {
		const tab = record.indexOf("\t");
		const fields = record.slice(0, tab).split(" ");
		map.set(record.slice(tab + 1), {
			mode: fields[0] ?? "",
			oid: fields[oidField] ?? "",
		});
	}
	return map;
}

async function treeEntries(
	git: SimpleGit,
	commit: string,
	paths: readonly string[],
): Promise<Map<string, Entry>> {
	const map = new Map<string, Entry>();
	for (const batch of batches(paths)) {
		const output = await git.raw([
			"ls-tree",
			"-r",
			"-z",
			"--full-tree",
			commit,
			"--",
			...batch,
		]);
		for (const [path, entry] of entries(output, 2)) map.set(path, entry);
	}
	return map;
}

/** What the worktree holds for `paths` now, hashed the way `git add` would. */
async function worktreeEntries(
	repo: Repo,
	paths: readonly string[],
): Promise<Map<string, Entry>> {
	return withSnapshotIndex(repo, async (git) => {
		await git.raw(["add", "-A"]);
		const map = new Map<string, Entry>();
		for (const batch of batches(paths)) {
			const output = await git.raw(["ls-files", "-s", "-z", "--", ...batch]);
			for (const [path, entry] of entries(output, 1)) map.set(path, entry);
		}
		return map;
	});
}

type Anchors = { harnessSessionId?: string; anchorItemIds?: string[] };

async function anchorRefs(
	git: SimpleGit,
	{ harnessSessionId, anchorItemIds = [] }: Anchors,
): Promise<{ base: string; before: string }[]> {
	if (!harnessSessionId || anchorItemIds.length === 0) return [];
	const output = await git.raw([
		"for-each-ref",
		"--format=%(refname) %(objectname)",
		...anchorItemIds.map((id) => `${anchorBase(harnessSessionId, id)}/before`),
	]);
	return output.split("\n").flatMap((line) => {
		const [ref = "", before = ""] = line.split(" ");
		return ref ? [{ base: ref.slice(0, -"/before".length), before }] : [];
	});
}

/** The refs of a settled turn: its own, or those it left under its tool calls before a resume. */
async function settledBase(
	git: SimpleGit,
	sessionId: string,
	turnId: string,
	anchors: Anchors,
): Promise<string | null> {
	const own = turnBase(sessionId, turnId);
	if (await readRef(git, `${own}/before`)) return own;
	return (await anchorRefs(git, anchors))[0]?.base ?? null;
}

/** Marks a turn undone under its own refs and under each alias of the same snapshot. */
async function markUndone(
	git: SimpleGit,
	base: string,
	before: string,
	undone: string,
	anchors: Anchors,
): Promise<void> {
	const bases = new Set([base]);
	for (const alias of await anchorRefs(git, anchors)) {
		if (alias.before === before) bases.add(alias.base);
	}
	for (const each of bases) {
		await git.raw(["update-ref", `${each}/undone`, undone]);
	}
}

/** The snapshot before the turn with the files Undo skipped as the turn left them, so they can be listed later. */
async function undoneCommit(
	repo: Repo,
	before: string,
	skipped: readonly string[],
	result: Map<string, Entry>,
): Promise<string> {
	if (skipped.length === 0) return before;
	return withScratchIndex(repo, async (scratch) => {
		await scratch.raw(["read-tree", `${before}^{tree}`]);
		const deleted = skipped.filter((path) => !result.has(path));
		for (const batch of batches(deleted)) {
			await scratch.raw(["update-index", "--force-remove", "--", ...batch]);
		}
		const kept = skipped.flatMap((path) => {
			const entry = result.get(path);
			return entry ? [`${entry.mode},${entry.oid},${path}`] : [];
		});
		for (const batch of batches(kept)) {
			await scratch.raw([
				"update-index",
				"--add",
				...batch.flatMap((info) => ["--cacheinfo", info]),
			]);
		}
		const tree = (await scratch.raw(["write-tree"])).trim();
		return (
			await scratch.raw([
				"commit-tree",
				tree,
				"-p",
				before,
				"-m",
				"superset chat turn undone",
			])
		).trim();
	});
}

export const checkpointCaptureTask = defineWorkerTask<
	{
		cwd: string;
		message: string;
		ref?: string;
		/** Refs the new snapshot makes stale. */
		dropRefs?: string[];
		timeoutMs?: number;
	},
	string | null
>({
	type: "checkpoints/capture",
	handler: async ({ cwd, message, ref, dropRefs = [], timeoutMs }) => {
		const repo = await repoAt(cwd);
		if (!repo) return null;
		const commit = await withSnapshotIndex(
			repo,
			(git) => snapshotCommit(git, message),
			timeoutMs ? AbortSignal.timeout(timeoutMs) : undefined,
		);
		const git = gitAt(repo.root);
		if (ref) await git.raw(["update-ref", ref, commit]);
		for (const stale of dropRefs) {
			await git.raw(["update-ref", "-d", stale]).catch(() => undefined);
		}
		return commit;
	},
});

export const checkpointRefTask = defineWorkerTask<
	{ cwd: string; ref: string; commit: string },
	void
>({
	type: "checkpoints/ref",
	handler: async ({ cwd, ref, commit }) => {
		await gitAt(cwd).raw(["update-ref", ref, commit]);
	},
});

export const checkpointAnchorTask = defineWorkerTask<
	{
		cwd: string;
		sessionId: string;
		turnId: string;
		harnessSessionId: string;
		anchorItemId: string;
	},
	void
>({
	type: "checkpoints/anchor",
	handler: async ({
		cwd,
		sessionId,
		turnId,
		harnessSessionId,
		anchorItemId,
	}) => {
		const git = gitAt(cwd);
		for (const snapshot of ["before", "after"] as const) {
			const commit = await readRef(git, turnRef(sessionId, turnId, snapshot));
			if (commit) {
				await git.raw([
					"update-ref",
					`${anchorBase(harnessSessionId, anchorItemId)}/${snapshot}`,
					commit,
				]);
			}
		}
	},
});

export const checkpointChangesTask = defineWorkerTask<
	{
		cwd: string;
		sessionId: string;
		turnId: string;
		live: boolean;
	} & Anchors,
	TurnChanges | null
>({
	type: "checkpoints/changes",
	handler: async ({ cwd, sessionId, turnId, live, ...anchors }) => {
		const repo = await repoAt(cwd);
		if (!repo) return null;
		const git = gitAt(repo.root);
		const base = live
			? turnBase(sessionId, turnId)
			: await settledBase(git, sessionId, turnId, anchors);
		if (!base) return null;
		const before = await readRef(git, `${base}/before`);
		if (!before) return null;
		let after = await readRef(git, `${base}/after`);
		const stillRunning = live && after === null;
		if (stillRunning) {
			after = await withSnapshotIndex(repo, (scratch) =>
				snapshotCommit(scratch, `superset chat turn ${turnId} live`),
			);
			await git.raw(["update-ref", `${base}/live`, after]);
		}
		if (!after) return null;
		const heads = await snapshotHeads(git, before, after);
		const [diffed, authored, message, undone] = await Promise.all([
			diffFiles(git, before, after),
			authoredPaths(git, before, after, heads),
			git.raw(["log", "-1", "--format=%B", after]),
			readRef(git, `${base}/undone`),
		]);
		const files = authored
			? diffed.filter((file) => authored.has(file.path))
			: diffed;
		const undoSkipped = undone
			? await changedNames(git, ["diff", before, undone])
			: [];
		return {
			root: repo.shownRoot,
			before,
			after,
			files,
			shared: message.includes(SHARED_TURN_TRAILER),
			live: stillRunning,
			undone: undone !== null,
			undoSkipped,
			committed: stillRunning
				? []
				: await committedPaths(
						git,
						after,
						heads.afterHead,
						files.map((file) => file.path),
					),
		};
	},
});

/**
 * What the turn staged for files Undo put back goes back to HEAD's version:
 * an index entry holding the turn's result, or a removal the turn staged.
 * Anything else in the user's index stays.
 */
async function unstageTurnResult(
	git: SimpleGit,
	paths: readonly string[],
	original: Map<string, Entry>,
	result: Map<string, Entry>,
	head: string | null,
): Promise<void> {
	if (paths.length === 0) return;
	const staged = new Map<string, Entry>();
	for (const batch of batches(paths)) {
		const output = await git.raw(["ls-files", "-s", "-z", "--", ...batch]);
		for (const [path, entry] of entries(output, 1)) staged.set(path, entry);
	}
	const inHead = head ? await treeEntries(git, head, paths) : new Map();
	const stagedByTurn = paths.filter((path) => {
		const left = result.get(path);
		const index = staged.get(path);
		if (left)
			return index?.oid === left.oid && inHead.get(path)?.oid !== left.oid;
		return !index && original.has(path) && inHead.has(path);
	});
	for (const batch of batches(stagedByTurn)) {
		await git.raw(
			head
				? ["reset", "-q", head, "--", ...batch]
				: ["rm", "--cached", "-q", "--ignore-unmatch", "--", ...batch],
		);
	}
}

async function kindAt(
	path: string,
): Promise<"file" | "folder" | "other" | null> {
	const stats = await lstat(path).catch(() => null);
	if (!stats) return null;
	if (stats.isFile()) return "file";
	return stats.isDirectory() ? "folder" : "other";
}

/** Every folder above `path`, inside the repo, is a real folder or not there yet. */
async function plainFolders(root: string, path: string): Promise<boolean> {
	const folders: string[] = [];
	for (
		let dir = dirname(path);
		dir !== "." && dir !== "/";
		dir = dirname(dir)
	) {
		folders.push(dir);
	}
	for (const folder of folders) {
		const kind = await kindAt(join(root, folder));
		if (kind !== null && kind !== "folder") return false;
	}
	return true;
}

/**
 * Removes the folders a removed file leaves empty, up to the repo root, but
 * not one made before `madeSinceMs`. A file system that records no creation
 * time reports 0, and those folders go as git would remove them.
 */
async function removeEmptyFolders(
	root: string,
	path: string,
	madeSinceMs: number,
): Promise<void> {
	for (
		let dir = dirname(path);
		dir !== "." && dir !== "/";
		dir = dirname(dir)
	) {
		const folder = join(root, dir);
		const madeSince = await stat(folder).then(
			({ birthtimeMs }) => birthtimeMs === 0 || birthtimeMs >= madeSinceMs,
			() => false,
		);
		if (!madeSince) return;
		const removed = await rmdir(folder).then(
			() => true,
			() => false,
		);
		if (!removed) return;
	}
}

/**
 * Puts files back as they were before the turn, but only those that still
 * hold exactly what the turn left, at a path that is still a plain file in
 * plain folders. Anything changed since, by anyone, stays as it is and is
 * listed. A turn that ran beside another chat is not undone: its result
 * holds that chat's edits too. The user's index, HEAD and branch are
 * untouched.
 */
export const checkpointUndoTask = defineWorkerTask<
	{
		cwd: string;
		sessionId: string;
		turnId: string;
		paths: string[];
	} & Anchors,
	TurnUndoResult
>({
	type: "checkpoints/undo",
	handler: async ({ cwd, sessionId, turnId, paths, ...anchors }) => {
		const repo = await repoAt(cwd);
		if (!repo) return { status: "refused", reason: "missing" };
		const git = gitAt(repo.root);
		const base = await settledBase(git, sessionId, turnId, anchors);
		if (!base) return { status: "refused", reason: "missing" };
		const [before, after, head] = await Promise.all([
			readRef(git, `${base}/before`),
			readRef(git, `${base}/after`),
			readRef(git, "HEAD"),
		]);
		if (!before || !after) return { status: "refused", reason: "missing" };
		const [heads, message] = await Promise.all([
			snapshotHeads(git, before, after),
			git.raw(["log", "-1", "--format=%B", after]),
		]);
		if (
			heads.beforeHead !== heads.afterHead ||
			(head ?? "") !== heads.afterHead
		) {
			return { status: "refused", reason: "head-moved" };
		}
		if (message.includes(SHARED_TURN_TRAILER)) {
			return { status: "refused", reason: "shared" };
		}
		const requested = new Set(paths);
		const changed = (await diffFiles(git, before, after))
			.map((file) => file.path)
			.filter((path) => requested.has(path));
		const [original, result, now] = await Promise.all([
			treeEntries(git, before, changed),
			treeEntries(git, after, changed),
			worktreeEntries(repo, changed),
		]);
		const unchangedSince = (path: string) => {
			const was = original.get(path);
			const left = result.get(path);
			const current = now.get(path);
			if (was && !REGULAR_FILE_MODES.has(was.mode)) return false;
			if (!left) return !current;
			return (
				REGULAR_FILE_MODES.has(left.mode) &&
				current?.mode === left.mode &&
				current.oid === left.oid
			);
		};
		const candidates = changed.filter(unchangedSince);

		const removals: string[] = [];
		for (const path of candidates.filter((each) => !original.has(each))) {
			if (
				(await plainFolders(repo.root, path)) &&
				(await kindAt(join(repo.root, path))) === "file"
			) {
				removals.push(path);
			}
		}

		const recreate: string[] = [];
		for (const path of candidates.filter((each) => original.has(each))) {
			const kind = await kindAt(join(repo.root, path));
			// Git skips an ignored file it no longer tracks, so a file back on
			// disk where the turn deleted one may be someone's, unseen above.
			const expected = result.has(path) ? "file" : null;
			if (kind === expected && (await plainFolders(repo.root, path))) {
				recreate.push(path);
			}
		}
		const restored = [...removals, ...recreate];
		await unstageTurnResult(git, restored, original, result, head);

		const capturedAtMs = Number(heads.capturedAt) * 1000;
		for (const path of removals) {
			await rm(join(repo.root, path));
			await removeEmptyFolders(repo.root, path, capturedAtMs);
		}
		if (recreate.length > 0) {
			await withScratchIndex(repo, async (scratch) => {
				await scratch.raw(["read-tree", `${before}^{tree}`]);
				for (const batch of batches(recreate)) {
					await scratch.raw(["checkout-index", "-f", "--", ...batch]);
				}
			});
		}
		const done = new Set(restored);
		const skipped = changed.filter((path) => !done.has(path));
		if (restored.length > 0) {
			await markUndone(
				git,
				base,
				before,
				await undoneCommit(repo, before, skipped, result),
				anchors,
			);
		}
		return {
			status: "undone",
			restored: changed.filter((path) => done.has(path)),
			skipped,
		};
	},
});

export const checkpointTasks = [
	checkpointCaptureTask,
	checkpointRefTask,
	checkpointAnchorTask,
	checkpointChangesTask,
	checkpointUndoTask,
];
