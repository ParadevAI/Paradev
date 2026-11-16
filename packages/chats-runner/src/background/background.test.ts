import { afterAll, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createBackgroundHost } from "./background.ts";

const root = mkdtempSync(join(tmpdir(), "background-"));
afterAll(() => rmSync(root, { recursive: true, force: true }));
let n = 0;

function host() {
	const agentDir = join(root, `agent-${++n}`);
	const notices: { chatId: string; text: string }[] = [];
	const h = createBackgroundHost({
		agentDir,
		deliver: async (chatId, text) => void notices.push({ chatId, text }),
	});
	return { h, notices, agentDir };
}

describe("the box's background work", () => {
	test("each end sends one notice to its chat, escaped, in Claude Code's envelope", async () => {
		const { h, notices } = host();
		h.start(
			{ id: "res-1", kind: "agent", chatId: "g1", description: "flights" },
			() => {},
		);
		expect(h.busy()).toBe(true);
		expect(h.running("agent")).toBe(1);
		await h.end("res-1", {
			status: "completed",
			summary: 'Agent "flights" finished',
			result: "<b>12th</b> & cheapest",
			usage: "3 steps, 20 s",
		});
		await h.end("res-1", { status: "completed", summary: "again" });
		expect(h.busy()).toBe(false);
		expect(notices).toEqual([
			{
				chatId: "g1",
				text: [
					"[Background notice: work you started ended. This is the system, not a message from anyone in the chat.]",
					"<task-notification>",
					"<task-id>res-1</task-id>",
					"<task-type>agent</task-type>",
					"<status>completed</status>",
					'<summary>Agent "flights" finished</summary>',
					"<result>&lt;b&gt;12th&lt;/b&gt; &amp; cheapest</result>",
					"<usage>3 steps, 20 s</usage>",
					"</task-notification>",
				].join("\n"),
			},
		]);
	});

	test("a quiet end (the Dev stopped it) sends none; a restart notifies again", async () => {
		const { h, notices } = host();
		h.start(
			{ id: "a", kind: "agent", chatId: "g1", description: "x" },
			() => {},
		);
		await h.end(
			"a",
			{ status: "stopped", summary: "stopped" },
			{ quiet: true },
		);
		expect(notices).toEqual([]);
		h.restart("a", () => {});
		expect(h.get("a")).toMatchObject({ status: "running", notified: false });
		await h.end("a", { status: "completed", summary: "done" });
		expect(notices).toHaveLength(1);
	});

	test("keeps a chat's newest finished work and forgets the rest; running work is never forgotten", async () => {
		const { h } = host();
		for (const id of ["a", "b", "c"]) {
			h.start({ id, kind: "agent", chatId: "g1", description: id }, () => {});
			await new Promise((r) => setTimeout(r, 2));
		}
		await h.end("a", { status: "completed", summary: "" });
		await h.end("b", { status: "completed", summary: "" });
		expect(h.prune("g1", 1).map((r) => r.id)).toEqual(["a"]);
		expect(h.inChat("g1").map((r) => r.id)).toEqual(["c", "b"]);
	});

	test("stops running work through its own stop, by id or for a whole chat", async () => {
		const { h } = host();
		const stopped: string[] = [];
		h.start(
			{ id: "a", kind: "shell", chatId: "g1", description: "a" },
			() => void stopped.push("a"),
		);
		h.start(
			{ id: "b", kind: "agent", chatId: "g1", description: "b" },
			() => (stopped.push("b"), "what it had"),
		);
		h.start(
			{ id: "c", kind: "agent", chatId: "g2", description: "c" },
			() => void stopped.push("c"),
		);
		expect(h.stop("b")).toEqual({ said: "what it had" });
		expect(h.stop("nope")).toBeUndefined();
		h.stopChat("g1");
		expect(stopped).toEqual(["b", "a", "b"]);
	});

	test("a monitor's event is a notice that doesn't end it", async () => {
		const { h, notices } = host();
		h.start(
			{ id: "m", kind: "monitor", chatId: "g1", description: "deploy" },
			() => {},
		);
		await h.event("m", 'Monitor "deploy" saw 1 new line', "deployed v42");
		expect(notices[0]!.text).toContain("<status>event</status>");
		expect(notices[0]!.text).toContain("<result>deployed v42</result>");
		expect(h.get("m")!.status).toBe("running");
	});

	test("a new box on the same folder reports what was running as lost, once", async () => {
		const { h, agentDir } = host();
		h.start(
			{
				id: "w",
				name: "draft",
				kind: "agent",
				chatId: "g2",
				description: "the draft",
			},
			() => {},
		);
		const notices: string[] = [];
		const next = createBackgroundHost({
			agentDir,
			deliver: async (_chat, text) => void notices.push(text),
		});
		await next.ready;
		expect(notices).toHaveLength(1);
		expect(notices[0]).toContain("<status>lost</status>");
		expect(notices[0]).toContain("`send_message` to draft picks it up again.");
		await createBackgroundHost({
			agentDir,
			deliver: async (_chat, text) => void notices.push(text),
		}).ready;
		expect(notices).toHaveLength(1);
	});
});
