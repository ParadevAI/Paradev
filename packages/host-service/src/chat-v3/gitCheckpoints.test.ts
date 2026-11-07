import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, rmSync, statSync } from "node:fs";
import { mkdir, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { TurnChangedFile } from "@superset/chat-runtime";
import { type SimpleGit, simpleGit } from "simple-git";
import { SHARED_TURN_TRAILER } from "../workers/tasks/checkpoints";
import { createGitCheckpoints } from "./gitCheckpoints";

describe("createGitCheckpoints", () => {
	let repo: string;
	let git: SimpleGit;
	const checkpoints = createGitCheckpoints((task, input) =>
		task.handler(input),
	);

	async function startTurn(sessionId: string, turnId: string) {
		const before = await checkpoints.capture({ cwd: repo, sessionId });
		if (!before) throw new Error("no snapshot");
		await checkpoints.turnStarted({ cwd: repo, sessionId, turnId, before });
	}

	beforeEach(async () => {
		repo = mkdtempSync(join(tmpdir(), "superset-turn-checkpoints-"));
		git = simpleGit(repo);
		await git.init();
		await git.raw(["config", "user.email", "test@example.com"]);
		await git.raw(["config", "user.name", "test"]);
		await git.raw(["config", "commit.gpgsign", "false"]);
		await writeFile(join(repo, "tracked.txt"), "one\ntwo\n");
		await writeFile(join(repo, "gone.txt"), "old\n");
		await git.raw(["add", "-A"]);
		await git.raw(["commit", "-m", "init"]);
	});

	afterEach(() => {
		rmSync(repo, { recursive: true, force: true });
	});

	test("counts every file a turn changed, shell edits included, without touching the index", async () => {
		await writeFile(join(repo, "staged.txt"), "staged by the user\n");
		await git.raw(["add", "staged.txt"]);
		const head = await git.revparse(["HEAD"]);
		const staged = await git.raw(["diff", "--cached", "--name-only"]);

		await startTurn("s1", "t1");
		await writeFile(join(repo, "tracked.txt"), "one\n2\nthree\n");
		await writeFile(join(repo, "made-by-shell.txt"), "a\nb\n");
		await rm(join(repo, "gone.txt"));
		const live = await checkpoints.changes({
			cwd: repo,
			sessionId: "s1",
			turnId: "t1",
			live: true,
		});
		await checkpoints.turnSettled({ cwd: repo, sessionId: "s1", turnId: "t1" });
		const settled = await checkpoints.changes({
			cwd: repo,
			sessionId: "s1",
			turnId: "t1",
			live: false,
		});
		const lateLive = await checkpoints.changes({
			cwd: repo,
			sessionId: "s1",
			turnId: "t1",
			live: true,
		});

		const expected: TurnChangedFile[] = [
			{ path: "gone.txt", status: "deleted", additions: 0, deletions: 1 },
			{
				path: "made-by-shell.txt",
				status: "added",
				additions: 2,
				deletions: 0,
			},
			{ path: "tracked.txt", status: "modified", additions: 2, deletions: 1 },
		];
		expect(live?.files).toEqual(expected);
		expect(live?.live).toBe(true);
		expect(settled?.files).toEqual(expected);
		expect(settled).toMatchObject({ live: false, shared: false });
		expect(lateLive).toMatchObject({ live: false, after: settled?.after });
		expect(
			await git.raw(["for-each-ref", "refs/superset/chat-turns/s1/t1/live"]),
		).toBe("");
		expect(await git.revparse(["HEAD"])).toBe(head);
		expect(await git.raw(["diff", "--cached", "--name-only"])).toBe(staged);
		expect(
			existsSync(
				join(
					repo,
					(
						await git.raw([
							"rev-parse",
							"--git-path",
							"superset-checkpoint-index",
						])
					).trim(),
				),
			),
		).toBe(true);
	});

	test("leaves out files that changed only because HEAD moved", async () => {
		await git.raw(["checkout", "-b", "upstream"]);
		await writeFile(join(repo, "pulled.txt"), "from upstream\n");
		await git.raw(["add", "pulled.txt"]);
		execFileSync("git", ["commit", "-m", "upstream work"], {
			cwd: repo,
			env: {
				...process.env,
				GIT_AUTHOR_DATE: "2020-01-01T00:00:00Z",
				GIT_COMMITTER_DATE: "2020-01-01T00:00:00Z",
			},
		});
		await git.raw(["checkout", "-"]);

		await startTurn("s1", "t1");
		await writeFile(join(repo, "mine.txt"), "agent\n");
		await git.raw(["merge", "--ff-only", "upstream"]);
		await checkpoints.turnSettled({ cwd: repo, sessionId: "s1", turnId: "t1" });

		const changes = await checkpoints.changes({
			cwd: repo,
			sessionId: "s1",
			turnId: "t1",
			live: false,
		});
		expect(changes?.files.map((file) => file.path)).toEqual(["mine.txt"]);
	});

	async function editedTurn() {
		await startTurn("s1", "t1");
		await writeFile(join(repo, "tracked.txt"), "agent\n");
		await writeFile(join(repo, "new.txt"), "agent\n");
		await rm(join(repo, "gone.txt"));
		await checkpoints.turnSettled({ cwd: repo, sessionId: "s1", turnId: "t1" });
	}
	const t1 = { sessionId: "s1", turnId: "t1" };
	const allPaths = ["gone.txt", "new.txt", "tracked.txt"];

	test("undoes a turn's files, leaving and listing any changed since, also on a later read", async () => {
		await editedTurn();
		await writeFile(join(repo, "new.txt"), "edited by the user\n");
		const staged = await git.raw(["diff", "--cached", "--name-only"]);

		const result = await checkpoints.undo({
			...t1,
			cwd: repo,
			paths: allPaths,
		});

		expect(result).toEqual({
			status: "undone",
			restored: ["gone.txt", "tracked.txt"],
			skipped: ["new.txt"],
		});
		expect(await readFile(join(repo, "tracked.txt"), "utf8")).toBe(
			"one\ntwo\n",
		);
		expect(await readFile(join(repo, "gone.txt"), "utf8")).toBe("old\n");
		expect(await readFile(join(repo, "new.txt"), "utf8")).toBe(
			"edited by the user\n",
		);
		expect(await git.raw(["diff", "--cached", "--name-only"])).toBe(staged);
		expect(
			await checkpoints.changes({ ...t1, cwd: repo, live: false }),
		).toMatchObject({ undone: true, undoSkipped: ["new.txt"] });
	});

	test("a later read lists as skipped only files Undo was asked for", async () => {
		await editedTurn();
		await writeFile(join(repo, "new.txt"), "edited by the user\n");

		await checkpoints.undo({
			...t1,
			cwd: repo,
			paths: ["gone.txt", "new.txt"],
		});

		expect(
			(await checkpoints.changes({ ...t1, cwd: repo, live: false }))
				?.undoSkipped,
		).toEqual(["new.txt"]);
	});

	test("leaves alone a path whose file or folder was swapped, or that git could misread", async () => {
		await mkdir(join(repo, "dir"));
		await writeFile(join(repo, "dir/x.txt"), "x\n");
		await writeFile(join(repo, "config"), "file\n");
		await git.raw(["add", "-A"]);
		await git.raw(["commit", "-m", "shapes"]);
		await startTurn("s1", "t1");
		await rm(join(repo, "config"));
		await mkdir(join(repo, "config"));
		await writeFile(join(repo, "config/a.json"), "{}\n");
		await rm(join(repo, "dir"), { recursive: true });
		await writeFile(join(repo, "dir"), "now a file\n");
		await writeFile(join(repo, ":weird"), "agent\n");
		await checkpoints.turnSettled({ cwd: repo, sessionId: "s1", turnId: "t1" });
		await writeFile(join(repo, "config/user.json"), "mine\n");
		await writeFile(join(repo, "dir"), "edited by the user\n");
		await writeFile(join(repo, ":weird"), "edited by the user\n");

		const result = await checkpoints.undo({
			...t1,
			cwd: repo,
			paths: [":weird", "config", "config/a.json", "dir", "dir/x.txt"],
		});

		expect(result).toEqual({
			status: "undone",
			restored: ["config/a.json"],
			skipped: [":weird", "config", "dir", "dir/x.txt"],
		});
		expect(await readFile(join(repo, "config/user.json"), "utf8")).toBe(
			"mine\n",
		);
		expect(await readFile(join(repo, "dir"), "utf8")).toBe(
			"edited by the user\n",
		);
		expect(await readFile(join(repo, ":weird"), "utf8")).toBe(
			"edited by the user\n",
		);
		expect(existsSync(join(repo, "config/a.json"))).toBe(false);
	});

	test("removes the folders a turn made for a file it added", async () => {
		await startTurn("s1", "t1");
		await mkdir(join(repo, "made/deep"), { recursive: true });
		await writeFile(join(repo, "made/deep/x.txt"), "agent\n");
		await checkpoints.turnSettled({ cwd: repo, sessionId: "s1", turnId: "t1" });

		await checkpoints.undo({ ...t1, cwd: repo, paths: ["made/deep/x.txt"] });

		expect(existsSync(join(repo, "made"))).toBe(false);
	});

	test.skipIf(statSync(tmpdir()).birthtimeMs === 0)(
		"keeps an empty folder that was there before the turn",
		async () => {
			await mkdir(join(repo, "logs"));
			await startTurn("s1", "t1");
			await writeFile(join(repo, "logs/debug.txt"), "agent\n");
			await checkpoints.turnSettled({
				cwd: repo,
				sessionId: "s1",
				turnId: "t1",
			});
			const beforeRef = "refs/superset/chat-turns/s1/t1/before";
			const before = (await git.revparse([beforeRef])).trim();
			const takenAfterFolder = `@${Math.ceil(statSync(join(repo, "logs")).birthtimeMs / 1000) + 1} +0000`;
			const restamped = execFileSync(
				"git",
				[
					"commit-tree",
					`${before}^{tree}`,
					"-p",
					(await git.revparse([`${before}^`])).trim(),
					"-m",
					"superset chat turn before",
				],
				{
					cwd: repo,
					env: {
						...process.env,
						GIT_AUTHOR_DATE: takenAfterFolder,
						GIT_COMMITTER_DATE: takenAfterFolder,
					},
				},
			)
				.toString()
				.trim();
			await git.raw(["update-ref", beforeRef, restamped]);

			await checkpoints.undo({ ...t1, cwd: repo, paths: ["logs/debug.txt"] });

			expect(existsSync(join(repo, "logs/debug.txt"))).toBe(false);
			expect(existsSync(join(repo, "logs"))).toBe(true);
		},
	);

	test("puts back what the turn staged for the files it undoes", async () => {
		await startTurn("s1", "t1");
		await writeFile(join(repo, "tracked.txt"), "agent\n");
		await writeFile(join(repo, "new.txt"), "agent\n");
		await git.raw(["add", "tracked.txt", "new.txt"]);
		await git.raw(["rm", "-q", "gone.txt"]);
		await checkpoints.turnSettled({ cwd: repo, sessionId: "s1", turnId: "t1" });

		await checkpoints.undo({ ...t1, cwd: repo, paths: allPaths });

		expect(await git.raw(["status", "--porcelain"])).toBe("");
	});

	test("keeps a turn undoable when everything it changed was changed again", async () => {
		await editedTurn();
		await writeFile(join(repo, "tracked.txt"), "edited by the user\n");

		const result = await checkpoints.undo({
			...t1,
			cwd: repo,
			paths: ["tracked.txt"],
		});

		expect(result).toEqual({
			status: "undone",
			restored: [],
			skipped: ["tracked.txt"],
		});
		expect(
			(await checkpoints.changes({ ...t1, cwd: repo, live: false }))?.undone,
		).toBe(false);
	});

	test("touches no file when the index is locked, so trying again undoes the turn", async () => {
		await startTurn("s1", "t1");
		await writeFile(join(repo, "tracked.txt"), "agent\n");
		await git.raw(["add", "tracked.txt"]);
		await checkpoints.turnSettled({ cwd: repo, sessionId: "s1", turnId: "t1" });
		const lock = join(repo, ".git", "index.lock");
		await writeFile(lock, "");

		const undo = () =>
			checkpoints.undo({ ...t1, cwd: repo, paths: ["tracked.txt"] });
		await expect(undo()).rejects.toThrow();
		expect(await readFile(join(repo, "tracked.txt"), "utf8")).toBe("agent\n");

		await rm(lock);
		await undo();
		expect(await git.raw(["status", "--porcelain"])).toBe("");
	});

	test("leaves alone an ignored file back on disk where the turn deleted it", async () => {
		await writeFile(join(repo, ".gitignore"), "*.log\n");
		await writeFile(join(repo, "build.log"), "tracked anyway\n");
		await git.raw(["add", "-f", ".gitignore", "build.log"]);
		await git.raw(["commit", "-q", "-m", "ignored but tracked"]);
		await startTurn("s1", "t1");
		await git.raw(["rm", "-q", "build.log"]);
		await checkpoints.turnSettled({ cwd: repo, sessionId: "s1", turnId: "t1" });
		await writeFile(join(repo, "build.log"), "written by the user\n");

		const result = await checkpoints.undo({
			...t1,
			cwd: repo,
			paths: ["build.log"],
		});

		expect(result).toMatchObject({ status: "undone", skipped: ["build.log"] });
		expect(await readFile(join(repo, "build.log"), "utf8")).toBe(
			"written by the user\n",
		);
	});

	test("refuses to undo a turn that shared the worktree with another chat", async () => {
		await startTurn("s1", "t1");
		await startTurn("s2", "t2");
		await writeFile(join(repo, "tracked.txt"), "both chats\n");
		await checkpoints.turnSettled({ cwd: repo, sessionId: "s2", turnId: "t2" });
		await checkpoints.turnSettled({ cwd: repo, sessionId: "s1", turnId: "t1" });

		expect(
			await checkpoints.undo({ ...t1, cwd: repo, paths: ["tracked.txt"] }),
		).toEqual({ status: "refused", reason: "shared" });
		expect(await readFile(join(repo, "tracked.txt"), "utf8")).toBe(
			"both chats\n",
		);
	});

	test("rebuilds a snapshot index git can no longer read", async () => {
		const snapshotIndex = join(
			repo,
			(
				await git.raw(["rev-parse", "--git-path", "superset-checkpoint-index"])
			).trim(),
		);
		await writeFile(snapshotIndex, "not an index");

		const first = await checkpoints.capture({ cwd: repo, sessionId: "s1" });
		const second = await checkpoints.capture({ cwd: repo, sessionId: "s1" });

		expect(first).toBeString();
		expect(second).toBeString();
		expect(
			execFileSync("git", ["ls-files"], {
				cwd: repo,
				env: { ...process.env, GIT_INDEX_FILE: snapshotIndex },
			}).toString(),
		).toBe("gone.txt\ntracked.txt\n");
	});

	test("sees a same-size edit made in the second the index was written", async () => {
		await writeFile(join(repo, "tracked.txt"), "aaa\n");
		await git.raw(["add", "tracked.txt"]);
		await writeFile(join(repo, "tracked.txt"), "bbb\n");

		const before = await checkpoints.capture({ cwd: repo, sessionId: "s1" });

		expect(await git.raw(["show", `${before}:tracked.txt`])).toBe("bbb\n");
	});

	test("reports the root the way the chat's path spells it, through a symlink", async () => {
		const link = `${repo}-link`;
		await symlink(repo, link);
		try {
			const before = await checkpoints.capture({ cwd: link, sessionId: "s1" });
			await checkpoints.turnStarted({
				cwd: link,
				sessionId: "s1",
				turnId: "t1",
				before: before ?? "",
			});
			await writeFile(join(repo, "tracked.txt"), "agent\n");
			await checkpoints.turnSettled({
				cwd: link,
				sessionId: "s1",
				turnId: "t1",
			});

			expect(
				(await checkpoints.changes({ ...t1, cwd: link, live: false }))?.root,
			).toBe(link);
		} finally {
			rmSync(link, { force: true });
		}
	});

	test("once the turn's files are committed, lists them so and refuses to undo", async () => {
		await editedTurn();
		await git.raw(["add", "-A"]);
		await git.raw(["commit", "-m", "the turn's work"]);

		const changes = await checkpoints.changes({
			...t1,
			cwd: repo,
			live: false,
		});
		const undo = await checkpoints.undo({ ...t1, cwd: repo, paths: allPaths });

		expect(changes?.committed).toEqual(allPaths);
		expect(undo).toEqual({ status: "refused", reason: "head-moved" });
	});

	test("finds a settled turn again by its tool calls once the chat resumes under new ids", async () => {
		await startTurn("s1", "t1");
		await writeFile(join(repo, "tracked.txt"), "agent\n");
		await checkpoints.turnSettled({
			cwd: repo,
			sessionId: "s1",
			turnId: "t1",
			anchor: { harnessSessionId: "agent-1", itemId: "toolu_1" },
		});
		const resumed = { cwd: repo, sessionId: "s2", turnId: "t9", live: false };
		const anchored = {
			...resumed,
			harnessSessionId: "agent-1",
			anchorItemIds: ["toolu_0", "toolu_1"],
		};

		expect(await checkpoints.changes(resumed)).toBeNull();
		expect(
			await checkpoints.changes({ ...anchored, harnessSessionId: "agent-2" }),
		).toBeNull();
		expect(
			(await checkpoints.changes(anchored))?.files.map((file) => file.path),
		).toEqual(["tracked.txt"]);
		await checkpoints.undo({
			cwd: repo,
			sessionId: "s1",
			turnId: "t1",
			paths: ["tracked.txt"],
			harnessSessionId: "agent-1",
			anchorItemIds: ["toolu_1"],
		});
		expect((await checkpoints.changes(anchored))?.undone).toBe(true);
	});

	function recordingCheckpoints() {
		const afterMessages = new Map<string, string>();
		const tasks: string[] = [];
		let tick = 0;
		const gates = new Map<string, Promise<void>>();
		const checkpoints = createGitCheckpoints(
			async (task, input) => {
				tasks.push(task.type);
				await gates.get(task.type);
				const { ref, message } = input as { ref?: string; message?: string };
				if (ref?.endsWith("/after") && message) afterMessages.set(ref, message);
				return (task.type === "checkpoints/capture" ? "sha" : null) as never;
			},
			{ now: () => ++tick, captureTimeoutMs: 50 },
		);
		const shared = (sessionId: string, turnId: string) =>
			afterMessages
				.get(`refs/superset/chat-turns/${sessionId}/${turnId}/after`)
				?.includes(SHARED_TURN_TRAILER) ?? false;
		return { checkpoints, gates, shared, tasks };
	}

	test("marks turns that overlapped another chat's, counting from the snapshot before the prompt", async () => {
		const { checkpoints: recording, shared } = recordingCheckpoints();
		const target = (sessionId: string, turnId: string) => ({
			cwd: "/repo",
			sessionId,
			turnId,
		});
		const turn = async (sessionId: string, turnId: string) => {
			await recording.capture({ cwd: "/repo", sessionId });
			await recording.turnStarted({
				...target(sessionId, turnId),
				before: "b",
			});
		};

		await turn("s1", "t1");
		await turn("s2", "t2");
		await recording.turnSettled(target("s2", "t2"));
		await recording.turnSettled(target("s1", "t1"));
		await recording.capture({ cwd: "/repo", sessionId: "s1" });
		await turn("s3", "t3");
		await recording.turnSettled(target("s3", "t3"));
		await recording.turnStarted({ ...target("s1", "t4"), before: "b" });
		await recording.turnSettled(target("s1", "t4"));
		await turn("s1", "t5");
		await recording.turnSettled(target("s1", "t5"));

		expect(
			[
				["s1", "t1"],
				["s2", "t2"],
				["s3", "t3"],
				["s1", "t4"],
				["s1", "t5"],
			].map(([sessionId = "", turnId = ""]) => shared(sessionId, turnId)),
		).toEqual([true, true, true, true, false]);
	});

	test("marks a turn shared when another chat's turn without a snapshot overlapped it", async () => {
		const { checkpoints: recording, shared, tasks } = recordingCheckpoints();
		const t1 = { cwd: "/repo", sessionId: "s1", turnId: "t1" };
		const t2 = { cwd: "/repo", sessionId: "s2", turnId: "t2" };

		await recording.capture({ cwd: "/repo", sessionId: "s1" });
		await recording.turnStarted({ ...t1, before: "b" });
		await recording.turnStarted({ ...t2, before: null });
		await recording.turnSettled(t2);
		await recording.turnSettled(t1);

		expect(shared("s1", "t1")).toBe(true);
		expect(tasks).toEqual([
			"checkpoints/capture",
			"checkpoints/ref",
			"checkpoints/capture",
		]);
	});

	test("a snapshot in a worktree waits for an Undo there to finish", async () => {
		const { checkpoints: recording, gates, tasks } = recordingCheckpoints();
		let finishUndo = () => {};
		gates.set(
			"checkpoints/undo",
			new Promise<void>((resolve) => {
				finishUndo = resolve;
			}),
		);

		const undo = recording.undo({
			cwd: "/repo",
			sessionId: "s1",
			turnId: "t1",
			paths: ["a.ts"],
		});
		const capture = recording.capture({ cwd: "/repo", sessionId: "s2" });
		await Promise.resolve();
		const startedDuringUndo = [...tasks];
		finishUndo();
		await Promise.all([undo, capture]);

		expect(startedDuringUndo).toEqual(["checkpoints/undo"]);
		expect(tasks).toEqual(["checkpoints/undo", "checkpoints/capture"]);
	});

	test("a prompt's snapshot waits for the previous turn's, and gives up at the deadline", async () => {
		const { checkpoints: recording, gates, tasks } = recordingCheckpoints();
		const t1 = { cwd: "/repo", sessionId: "s1", turnId: "t1" };
		await recording.turnStarted({ ...t1, before: "b" });
		gates.set("checkpoints/capture", new Promise<void>(() => {}));

		const settled = recording.turnSettled(t1);
		const before = await recording.capture({ cwd: "/repo", sessionId: "s1" });

		expect(before).toBeNull();
		expect(tasks).toEqual(["checkpoints/ref", "checkpoints/capture"]);
		void settled;
	});

	test("snapshots the chat's worktree when the host inherited another repository's GIT_DIR", async () => {
		const other = mkdtempSync(join(tmpdir(), "superset-turn-other-repo-"));
		execFileSync("git", ["init", "-q", other]);
		const inherited = process.env.GIT_DIR;
		process.env.GIT_DIR = join(other, ".git");
		try {
			await startTurn("s1", "t1");
			await writeFile(join(repo, "tracked.txt"), "one\n2\n");
			await checkpoints.turnSettled({
				cwd: repo,
				sessionId: "s1",
				turnId: "t1",
			});
			const changes = await checkpoints.changes({
				cwd: repo,
				sessionId: "s1",
				turnId: "t1",
				live: false,
			});
			expect(changes?.files.map((file) => file.path)).toEqual(["tracked.txt"]);
			expect(
				execFileSync("git", ["-C", other, "for-each-ref"], {
					encoding: "utf8",
				}),
			).toBe("");
		} finally {
			if (inherited === undefined) delete process.env.GIT_DIR;
			else process.env.GIT_DIR = inherited;
			rmSync(other, { recursive: true, force: true });
		}
	});
});
