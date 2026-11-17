import { afterAll, describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { ToolDefinition } from "@earendil-works/pi-coding-agent";
import { createBackgroundHost } from "../background/background.ts";
import { backgroundTools, type CommandLimits } from "./background-tools.ts";

const root = mkdtempSync(join(tmpdir(), "background-tools-"));
afterAll(() => rmSync(root, { recursive: true, force: true }));
let n = 0;

function setup(
	opts: { canBackground?: boolean; limits?: Partial<CommandLimits> } = {},
) {
	const agentDir = join(root, `agent-${++n}`);
	mkdirSync(agentDir, { recursive: true });
	const notices: string[] = [];
	const host = createBackgroundHost({
		agentDir,
		deliver: async (_chat, text) => void notices.push(text),
	});
	const turn = new AbortController();
	const tools = new Map(
		backgroundTools({
			agentDir,
			chatId: "g1",
			host,
			turnEnv: () => ({ DEV_GROUP_ID: "g1" }),
			turnSignal: () => turn.signal,
			canBackground: () => opts.canBackground ?? true,
			logDir: join(agentDir, "logs"),
			...(opts.limits ? { limits: opts.limits } : {}),
		}).map((t) => [t.name, t as ToolDefinition]),
	);
	type Result = {
		content: { text: string }[];
		details: { backgroundTaskId?: string; taskId?: string };
	};
	const call = (name: string, params: Record<string, unknown>) =>
		tools
			.get(name)!
			.execute(
				"c1",
				params as never,
				undefined,
				undefined,
				{} as never,
			) as Promise<Result>;
	const text = (r: Result) => r.content[0]!.text;
	const until = async (check: () => boolean) => {
		while (!check()) await new Promise((r) => setTimeout(r, 10));
	};
	return { host, turn, call, text, notices, until };
}

describe("bash", () => {
	test("kept in the turn, returns its output with the turn's env; a failure is an error with its exit code", async () => {
		const s = setup();
		expect(
			s.text(await s.call("bash", { command: "echo hi $DEV_GROUP_ID" })),
		).toBe("hi g1\n");
		await expect(
			s.call("bash", { command: "echo nope >&2; exit 3" }),
		).rejects.toThrow("nope\n\n\nCommand exited with code 3");
	});

	test("in the background: its id and output file at once, then a notice when it exits", async () => {
		const s = setup();
		const started = await s.call("bash", {
			command: "sleep 0.1; echo built",
			run_in_background: true,
			description: "the build",
		});
		const id = started.details.backgroundTaskId!;
		expect(s.text(started)).toMatch(
			new RegExp(
				`^Command running in the background with ID ${id}\\. Its output goes to .*${id}\\.log\\.`,
			),
		);
		expect(s.host.busy()).toBe(true);
		await s.until(() => s.notices.length === 1);
		expect(s.notices[0]).toContain(
			'<summary>Command "the build" exited with code 0</summary>',
		);
		expect(s.notices[0]).toContain("<result>built</result>");
		expect(s.notices[0]).toMatch(/<output-file>.*\.log<\/output-file>/);
		expect(
			readFileSync(
				s.notices[0]!.match(/<output-file>(.*)<\/output-file>/)![1]!,
				"utf8",
			),
		).toBe("built\n");
	});

	test("one that outlasts its timeout moves to the background rather than being killed", async () => {
		const s = setup();
		const result = await s.call("bash", {
			command: "echo started; sleep 1.4; echo done",
			timeout: 1_000,
		});
		expect(s.text(result)).toStartWith(
			"Command didn't finish within its 1 s timeout, so it moved to the background with ID sh-",
		);
		// A turn cancelled after the move no longer stops it.
		s.turn.abort();
		await s.until(() => s.notices.length === 1);
		expect(s.notices[0]).toContain("<result>started\ndone</result>");
	}, 10_000);

	test("without a chat's own turn it can't go to the background: past its timeout it's stopped", async () => {
		const s = setup({ canBackground: false });
		await expect(
			s.call("bash", { command: "sleep 5", timeout: 1_000 }),
		).rejects.toThrow("timed out after 1 s and was stopped");
		const bg = await s.call("bash", {
			command: "echo quick",
			run_in_background: true,
		});
		expect(s.text(bg)).toBe("quick\n");
	}, 10_000);

	test("cancelling the turn stops a command kept in it", async () => {
		const s = setup();
		const running = s.call("bash", { command: "sleep 5" });
		await new Promise((r) => setTimeout(r, 100));
		s.turn.abort();
		await expect(running).rejects.toThrow("Stopped: the turn was cancelled");
	});
});

describe("monitor and task_stop", () => {
	test("a monitor's new lines come as notices, gathered; it ends at its timeout", async () => {
		const s = setup({ limits: { monitorBatchMs: 200 } });
		const started = await s.call("monitor", {
			description: "deploys",
			command: "echo one; echo two; sleep 0.6; echo three; sleep 5",
			timeout_ms: 1_500,
		});
		const id = started.details.taskId!;
		expect(s.text(started)).toStartWith(`Monitor started with ID ${id}`);
		await s.until(() => s.notices.length >= 2);
		expect(s.notices[0]).toContain("<status>event</status>");
		expect(s.notices[0]).toContain("<result>one\ntwo</result>");
		expect(s.notices[1]).toContain("<result>three</result>");
		await s.until(() => !s.host.busy());
		expect(s.notices.at(-1)).toContain(
			'<summary>Monitor "deploys" ended after 2 s; start it again if you still need it</summary>',
		);
	}, 10_000);

	test("a monitor that sends too many notices is stopped", async () => {
		const s = setup({ limits: { monitorBatchMs: 50, monitorPerHour: 2 } });
		await s.call("monitor", {
			description: "chatty",
			command: "while true; do echo tick; sleep 0.06; done",
		});
		await s.until(() => !s.host.busy());
		expect(s.notices.at(-1)).toContain(
			"was stopped: more than 2 notices in an hour",
		);
	}, 10_000);

	test("task_stop stops a command or a monitor in this chat, with no notice", async () => {
		const s = setup();
		const id = (
			await s.call("bash", { command: "sleep 5", run_in_background: true })
		).details.backgroundTaskId!;
		expect(s.text(await s.call("task_stop", { task_id: id }))).toBe(
			`Stopped ${id}.`,
		);
		await s.until(() => !s.host.busy());
		expect(s.notices).toEqual([]);
		expect(s.text(await s.call("task_stop", { task_id: id }))).toBe(
			`${id} isn't running (stopped).`,
		);
		await expect(s.call("task_stop", { task_id: "sh-nope" })).rejects.toThrow(
			"No background work sh-nope",
		);
	});
});
