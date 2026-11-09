import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import {
	mkdirSync,
	mkdtempSync,
	readFileSync,
	realpathSync,
	rmSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { claudeSessionPath } from "../../../terminal-agents/harness-sessions/claude";
import { claudeTeleportProvider } from "./claude";

const SESSION = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";

describe("claudeTeleportProvider", () => {
	let root: string;

	beforeEach(() => {
		root = realpathSync(mkdtempSync(join(tmpdir(), "claude-teleport-")));
	});
	afterEach(() => rmSync(root, { recursive: true, force: true }));

	test("moves the session with its subagents, rewriting every path for the new host", async () => {
		const laptop = join(root, "laptop-repo");
		const box = join(root, "box-repo");
		mkdirSync(laptop);
		mkdirSync(box);
		const laptopEnv = { CLAUDE_CONFIG_DIR: join(root, "laptop-claude") };
		const boxEnv = { CLAUDE_CONFIG_DIR: join(root, "box-claude") };

		const mainFile = claudeSessionPath(laptopEnv, laptop, SESSION);
		const sourceDir = join(mainFile, "..");
		mkdirSync(join(sourceDir, SESSION, "subagents"), { recursive: true });
		writeFileSync(
			mainFile,
			[
				JSON.stringify({ type: "user", cwd: laptop }),
				JSON.stringify({ type: "user", cwd: join(laptop, "src") }),
				JSON.stringify({
					type: "user",
					cwd: laptop,
					message: `output saved to ${sourceDir}/${SESSION}/tool-results/a.txt`,
				}),
				"not json",
			].join("\n"),
		);
		writeFileSync(
			join(sourceDir, SESSION, "subagents", "agent-1.jsonl"),
			JSON.stringify({ type: "assistant", cwd: laptop }),
		);

		const stageDir = join(root, "stage");
		mkdirSync(stageDir);
		const manifest = await claudeTeleportProvider.collect({
			harnessSessionId: SESSION,
			worktreePath: laptop,
			env: laptopEnv,
			locate: async () => mainFile,
			stageDir,
		});
		await claudeTeleportProvider.place({
			manifest,
			worktreePath: box,
			env: boxEnv,
			stageDir,
		});

		const placed = claudeSessionPath(boxEnv, box, SESSION);
		const targetDir = join(placed, "..");
		const lines = readFileSync(placed, "utf8").split("\n");
		expect(JSON.parse(lines[0] ?? "").cwd).toBe(box);
		expect(JSON.parse(lines[1] ?? "").cwd).toBe(join(box, "src"));
		expect(JSON.parse(lines[2] ?? "").message).toBe(
			`output saved to ${targetDir}/${SESSION}/tool-results/a.txt`,
		);
		expect(lines[3]).toBe("not json");
		const subagent = readFileSync(
			join(targetDir, SESSION, "subagents", "agent-1.jsonl"),
			"utf8",
		);
		expect(JSON.parse(subagent).cwd).toBe(box);
	});

	test("refuses a session id that would leave Claude's session directory", async () => {
		const stageDir = join(root, "stage");
		mkdirSync(join(stageDir, "session"), { recursive: true });
		await expect(
			claudeTeleportProvider.place({
				manifest: {
					version: 1,
					harnessSessionId: "../../escape",
					sourceCwd: root,
					sourceDir: root,
				},
				worktreePath: root,
				env: { CLAUDE_CONFIG_DIR: join(root, "claude") },
				stageDir,
			}),
		).rejects.toThrow("invalid session id");
	});
});
