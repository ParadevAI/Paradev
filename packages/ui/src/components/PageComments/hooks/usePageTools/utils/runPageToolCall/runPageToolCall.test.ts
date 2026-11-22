import { describe, expect, test } from "bun:test";
import type { PageToolServerReply } from "@superset/shared/page-tools";
import {
	createPageToolRunner,
	type PageToolHost,
	type PageToolPrompt,
} from "./runPageToolCall";

const REQUEST = { plugin: "neon", tool: "run_sql", args: {} };

function host(replies: PageToolServerReply[]) {
	const log: string[] = [];
	const h: PageToolHost = {
		callTool: async () => {
			log.push("call");
			const next = replies.shift();
			if (!next) throw new Error("no more replies");
			return next;
		},
		grant: async ({ plugin, connectionId }) => {
			log.push(`grant:${plugin}:${connectionId ?? ""}`);
		},
		install: async (plugin) => {
			log.push(`install:${plugin}`);
		},
		openUrl: (url) => {
			log.push(`open:${url}`);
		},
	};
	return { h, log };
}

describe("createPageToolRunner", () => {
	test("an ok reply goes straight to the page", async () => {
		const { h } = host([{ status: "ok", result: 1 }]);
		const run = createPageToolRunner(h, async () => ({ allow: false }));
		expect(await run(REQUEST)).toEqual({ ok: true, result: 1 });
	});

	test("first use asks, grants, and retries", async () => {
		const { h, log } = host([
			{ status: "needs_grant", pluginLabel: "Neon" },
			{ status: "ok", result: 1 },
		]);
		const prompts: PageToolPrompt[] = [];
		const run = createPageToolRunner(h, async (prompt) => {
			prompts.push(prompt);
			return { allow: true };
		});
		expect(await run(REQUEST)).toEqual({ ok: true, result: 1 });
		expect(prompts).toEqual([{ kind: "grant", pluginLabel: "Neon" }]);
		expect(log).toEqual(["call", "grant:neon:", "call"]);
	});

	test("a grant for a plugin with no account says so in the prompt", async () => {
		const { h } = host([
			{ status: "needs_grant", pluginLabel: "Exa", accountless: true },
			{ status: "ok", result: 1 },
		]);
		const prompts: PageToolPrompt[] = [];
		const run = createPageToolRunner(h, async (prompt) => {
			prompts.push(prompt);
			return { allow: true };
		});
		await run(REQUEST);
		expect(prompts).toEqual([
			{ kind: "grant", pluginLabel: "Exa", accountless: true },
		]);
	});

	test("a decline sticks for the session", async () => {
		const { h, log } = host([
			{ status: "needs_grant", pluginLabel: "Neon" },
			{ status: "needs_grant", pluginLabel: "Neon" },
		]);
		let asked = 0;
		const run = createPageToolRunner(h, async () => {
			asked++;
			return { allow: false };
		});
		expect(await run(REQUEST)).toMatchObject({ ok: false, code: "denied" });
		expect(await run(REQUEST)).toMatchObject({ ok: false, code: "denied" });
		expect(asked).toBe(1);
		expect(log).toEqual(["call"]);
	});

	test("concurrent calls share one prompt", async () => {
		const { h } = host([
			{ status: "needs_grant", pluginLabel: "Neon" },
			{ status: "needs_grant", pluginLabel: "Neon" },
			{ status: "ok", result: "a" },
			{ status: "ok", result: "b" },
		]);
		let asked = 0;
		const run = createPageToolRunner(h, async () => {
			asked++;
			return { allow: true };
		});
		const results = await Promise.all([run(REQUEST), run(REQUEST)]);
		expect(asked).toBe(1);
		expect(results.every((r) => r.ok)).toBe(true);
	});

	test("not installed offers install, then retries", async () => {
		const { h, log } = host([
			{ status: "needs_install", pluginLabel: "Neon" },
			{ status: "ok", result: 1 },
		]);
		const run = createPageToolRunner(h, async () => ({ allow: true }));
		expect(await run(REQUEST)).toEqual({ ok: true, result: 1 });
		expect(log).toEqual(["call", "install:neon", "call"]);
	});

	test("not connected opens the connect page and tells the page", async () => {
		const { h, log } = host([
			{
				status: "needs_connection",
				pluginLabel: "Neon",
				connectUrl: "https://x/connect",
			},
		]);
		const run = createPageToolRunner(h, async () => ({ allow: true }));
		expect(await run(REQUEST)).toMatchObject({
			ok: false,
			code: "needs_connection",
		});
		expect(log).toEqual(["call", "open:https://x/connect"]);
	});

	test("an account choice is granted and retried", async () => {
		const { h, log } = host([
			{
				status: "needs_account",
				pluginLabel: "Neon",
				accounts: [
					{ connectionId: "a", label: "work" },
					{ connectionId: "b", label: "home" },
				],
			},
			{ status: "ok", result: 1 },
		]);
		const run = createPageToolRunner(h, async () => ({
			allow: true,
			connectionId: "b",
		}));
		expect(await run(REQUEST)).toEqual({ ok: true, result: 1 });
		expect(log).toEqual(["call", "grant:neon:b", "call"]);
	});

	test("a server error passes its code through", async () => {
		const { h } = host([
			{ status: "error", code: "tool_error", message: "bad sql" },
		]);
		const run = createPageToolRunner(h, async () => ({ allow: true }));
		expect(await run(REQUEST)).toEqual({
			ok: false,
			code: "tool_error",
			message: "bad sql",
		});
	});

	test("a host that throws is unavailable, not a crash", async () => {
		const run = createPageToolRunner(
			{
				callTool: async () => {
					throw new Error("network");
				},
				grant: async () => {},
				install: async () => {},
				openUrl: () => {},
			},
			async () => ({ allow: true }),
		);
		expect(await run(REQUEST)).toMatchObject({
			ok: false,
			code: "unavailable",
		});
	});

	test("a reply loop stops instead of asking forever", async () => {
		const { h } = host(
			Array.from({ length: 10 }, () => ({
				status: "needs_install" as const,
				pluginLabel: "Neon",
			})),
		);
		const run = createPageToolRunner(h, async () => ({ allow: true }));
		expect(await run(REQUEST)).toMatchObject({
			ok: false,
			code: "unavailable",
		});
	});

	test("one grant decline mutes grant prompts for other plugins", async () => {
		const { h, log } = host([
			{ status: "needs_grant", pluginLabel: "Neon" },
			{ status: "needs_grant", pluginLabel: "Exa" },
			{ status: "ok", result: "granted earlier" },
		]);
		const prompts: PageToolPrompt[] = [];
		const run = createPageToolRunner(h, async (prompt) => {
			prompts.push(prompt);
			return { allow: false };
		});
		expect(await run(REQUEST)).toMatchObject({ code: "denied" });
		expect(await run({ ...REQUEST, plugin: "exa" })).toMatchObject({
			code: "denied",
		});
		expect(await run({ ...REQUEST, plugin: "linear" })).toEqual({
			ok: true,
			result: "granted earlier",
		});
		expect(prompts).toEqual([{ kind: "grant", pluginLabel: "Neon" }]);
		expect(log).toEqual(["call", "call", "call"]);
	});

	test("a grant prompt waiting behind a decline is never shown", async () => {
		const { h } = host([
			{ status: "needs_grant", pluginLabel: "Neon" },
			{ status: "needs_grant", pluginLabel: "Exa" },
		]);
		const prompts: PageToolPrompt[] = [];
		const run = createPageToolRunner(h, async (prompt) => {
			prompts.push(prompt);
			return { allow: false };
		});
		const results = await Promise.all([
			run(REQUEST),
			run({ ...REQUEST, plugin: "exa" }),
		]);
		expect(results.map((r) => !r.ok && r.code)).toEqual(["denied", "denied"]);
		expect(prompts).toEqual([{ kind: "grant", pluginLabel: "Neon" }]);
	});

	test("an unknown server status is unavailable", async () => {
		const { h } = host([
			{ status: "needs_payment" } as unknown as PageToolServerReply,
		]);
		const run = createPageToolRunner(h, async () => ({ allow: true }));
		expect(await run(REQUEST)).toMatchObject({
			ok: false,
			code: "unavailable",
		});
	});

	test("tells the page it is pending while asking and while setting up", async () => {
		const { h, log } = host([
			{ status: "needs_grant", pluginLabel: "Neon" },
			{ status: "ok", result: 1 },
		]);
		const run = createPageToolRunner(h, async () => {
			log.push("ask");
			return { allow: true };
		});
		await run(REQUEST, () => log.push("pending"));
		expect(log).toEqual([
			"pending",
			"call",
			"pending",
			"ask",
			"pending",
			"grant:neon:",
			"pending",
			"call",
		]);
	});

	test("keeps telling the page it is pending while a prompt stays open", async () => {
		const { h } = host([
			{ status: "needs_install", pluginLabel: "Neon" },
			{ status: "ok", result: 1 },
		]);
		const clock = manualClock();
		let pending = 0;
		let answer: (value: { allow: true }) => void = () => {};
		const run = createPageToolRunner(
			h,
			() => new Promise((resolve) => (answer = resolve)),
			{ pendingIntervalMs: 2, every: clock.every },
		);
		const outcome = run(REQUEST, () => pending++);
		await settle();
		clock.tick();
		clock.tick();
		expect(pending).toBe(4);
		answer({ allow: true });
		expect(await outcome).toEqual({ ok: true, result: 1 });
		expect(clock.running()).toBe(0);
	});

	test("keeps telling the page it is pending while the tool runs", async () => {
		const clock = manualClock();
		let finish: (reply: PageToolServerReply) => void = () => {};
		const h: PageToolHost = {
			callTool: () => new Promise((resolve) => (finish = resolve)),
			grant: async () => {},
			install: async () => {},
			openUrl: () => {},
		};
		let pending = 0;
		const run = createPageToolRunner(h, async () => ({ allow: false }), {
			pendingIntervalMs: 2,
			every: clock.every,
		});
		const outcome = run(REQUEST, () => pending++);
		await settle();
		clock.tick();
		clock.tick();
		clock.tick();
		expect(pending).toBe(4);
		expect(clock.running()).toBe(1);
		finish({ status: "ok", result: 1 });
		expect(await outcome).toEqual({ ok: true, result: 1 });
		expect(clock.running()).toBe(0);
		clock.tick();
		expect(pending).toBe(4);
	});

	test("a stopped runner refuses without asking or keeping the page alive", async () => {
		const { h, log } = host([{ status: "needs_grant", pluginLabel: "Neon" }]);
		const clock = manualClock();
		let asked = 0;
		const run = createPageToolRunner(
			h,
			async () => {
				asked++;
				return { allow: true };
			},
			{ stopped: () => true, every: clock.every },
		);
		expect(await run(REQUEST, () => log.push("pending"))).toMatchObject({
			ok: false,
			code: "denied",
		});
		expect(asked).toBe(0);
		expect(log).toEqual(["call"]);
		expect(clock.started()).toBe(0);
	});

	test("stopping clears the keep-alive of a call already waiting", async () => {
		const { h } = host([{ status: "needs_install", pluginLabel: "Neon" }]);
		const clock = manualClock();
		let stopped = false;
		let pending = 0;
		let answer: (value: { allow: false }) => void = () => {};
		const run = createPageToolRunner(
			h,
			() => new Promise((resolve) => (answer = resolve)),
			{ stopped: () => stopped, every: clock.every },
		);
		const outcome = run(REQUEST, () => pending++);
		await settle();
		expect(clock.running()).toBe(1);
		stopped = true;
		clock.tick();
		expect(pending).toBe(2);
		expect(clock.running()).toBe(0);
		answer({ allow: false });
		expect(await outcome).toMatchObject({ ok: false, code: "needs_install" });
	});
});

function manualClock() {
	const ticks = new Set<() => void>();
	let started = 0;
	return {
		every: (tick: () => void) => {
			started++;
			ticks.add(tick);
			return () => {
				ticks.delete(tick);
			};
		},
		tick: () => {
			for (const tick of [...ticks]) tick();
		},
		running: () => ticks.size,
		started: () => started,
	};
}

async function settle() {
	for (let turn = 0; turn < 10; turn++) await Promise.resolve();
}
