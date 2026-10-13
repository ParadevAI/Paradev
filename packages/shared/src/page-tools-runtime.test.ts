import { describe, expect, test } from "bun:test";
import { TOOLS_HOST_CHANNEL } from "./page-tools";
import { pageToolsRuntimeSource } from "./page-tools-runtime";

interface Tools {
	ready: Promise<boolean>;
	call(plugin: string, tool: string, args?: unknown): Promise<unknown>;
}

async function flush(): Promise<void> {
	for (let turn = 0; turn < 20; turn++) await Promise.resolve();
}

function fakeClock() {
	let now = 0;
	let nextId = 1;
	const timers = new Map<number, { at: number; fn: () => void }>();
	return {
		setTimeout: (fn: () => void, ms: number) => {
			const id = nextId++;
			timers.set(id, { at: now + ms, fn });
			return id;
		},
		clearTimeout: (id: number | null) => {
			if (id !== null) timers.delete(id);
		},
		Date: { now: () => now },
		advance(ms: number) {
			const end = now + ms;
			for (;;) {
				let due: [number, { at: number; fn: () => void }] | null = null;
				for (const entry of timers) {
					if (entry[1].at <= end && (!due || entry[1].at < due[1].at)) {
						due = entry;
					}
				}
				if (!due) break;
				timers.delete(due[0]);
				now = due[1].at;
				due[1].fn();
			}
			now = end;
		},
	};
}

function mount({
	framed = true,
	helloTimeoutMs = 2000,
	callTimeoutMs = 60_000,
	postMessage = (_m: Record<string, unknown>) => {},
} = {}) {
	const posted: Record<string, unknown>[] = [];
	const listeners: ((event: unknown) => void)[] = [];
	const win: Record<string, unknown> = {};
	const clock = fakeClock();
	const parent = framed
		? {
				postMessage: (m: Record<string, unknown>) => {
					postMessage(m);
					posted.push(m);
				},
			}
		: win;
	new Function(
		"window",
		"parent",
		"addEventListener",
		"setTimeout",
		"clearTimeout",
		"Date",
		pageToolsRuntimeSource({ helloTimeoutMs, callTimeoutMs }),
	)(
		win,
		parent,
		(type: string, fn: (event: unknown) => void) => {
			if (type === "message") listeners.push(fn);
		},
		clock.setTimeout,
		clock.clearTimeout,
		clock.Date,
	);
	const tools = (win.superset as { tools: Tools }).tools;
	const fromHost = (body: Record<string, unknown>) => {
		for (const fn of listeners) {
			fn({ data: { channel: TOOLS_HOST_CHANNEL, ...body }, source: parent });
		}
	};
	return { tools, posted, fromHost, listeners, parent, clock };
}

describe("page tools runtime", () => {
	test("no host: ready is false and a call is unavailable", async () => {
		const { tools } = mount({ framed: false });
		expect(await tools.ready).toBe(false);
		await expect(tools.call("neon", "run_sql", {})).rejects.toMatchObject({
			code: "unavailable",
		});
	});

	test("a host that is not signed in makes calls unavailable_signed_out", async () => {
		const { tools, fromHost } = mount();
		fromHost({ type: "ready", available: false, reason: "signed_out" });
		expect(await tools.ready).toBe(false);
		await expect(tools.call("neon", "run_sql", {})).rejects.toMatchObject({
			code: "unavailable_signed_out",
		});
	});

	test("a host with no tools here makes calls unavailable, not signed out", async () => {
		for (const ready of [
			{ type: "ready", available: false, reason: "unavailable" },
			{ type: "ready", available: false },
		]) {
			const { tools, fromHost } = mount();
			fromHost(ready);
			expect(await tools.ready).toBe(false);
			await expect(tools.call("neon", "run_sql", {})).rejects.toMatchObject({
				code: "unavailable",
			});
		}
	});

	test("a call goes to the host and resolves with its result", async () => {
		const { tools, posted, fromHost } = mount();
		fromHost({ type: "ready", available: true });
		await tools.ready;
		const pending = tools.call("neon", "run_sql", { sql: "select 1" });
		await flush();
		const call = posted.find((m) => m.type === "call") as {
			id: string;
			request: unknown;
		};
		expect(call.request).toEqual({
			plugin: "neon",
			tool: "run_sql",
			args: { sql: "select 1" },
		});
		fromHost({ type: "result", id: call.id, ok: true, result: { rows: [1] } });
		expect(await pending).toEqual({ rows: [1] });
	});

	test("carries the host's error code to the page", async () => {
		const { tools, posted, fromHost } = mount();
		fromHost({ type: "ready", available: true });
		await tools.ready;
		const pending = tools.call("neon", "run_sql", {});
		await flush();
		const call = posted.find((m) => m.type === "call") as { id: string };
		fromHost({
			type: "result",
			id: call.id,
			ok: false,
			code: "needs_connection",
			message: "Connect Neon",
		});
		await expect(pending).rejects.toMatchObject({ code: "needs_connection" });
	});

	test("a call with no answer times out as unavailable", async () => {
		const { tools, fromHost, clock } = mount({ callTimeoutMs: 5 });
		fromHost({ type: "ready", available: true });
		await tools.ready;
		const call = tools.call("neon", "run_sql", {});
		await flush();
		clock.advance(5);
		await expect(call).rejects.toMatchObject({ code: "unavailable" });
	});

	test("refuses a bad plugin or tool name before posting", async () => {
		const { tools, posted, fromHost } = mount();
		fromHost({ type: "ready", available: true });
		await tools.ready;
		await expect(tools.call("", "run_sql", {})).rejects.toMatchObject({
			code: "invalid",
		});
		await expect(tools.call("neon", "x".repeat(129), {})).rejects.toMatchObject(
			{
				code: "invalid",
			},
		);
		expect(posted.filter((m) => m.type === "call")).toEqual([]);
	});

	test("ignores host messages from anything but the parent", async () => {
		const { tools, listeners, clock } = mount({ helloTimeoutMs: 20 });
		for (const fn of listeners) {
			fn({
				data: { channel: TOOLS_HOST_CHANNEL, type: "ready", available: true },
				source: {},
			});
		}
		clock.advance(200);
		expect(await tools.ready).toBe(false);
	});

	test("a pending notice from the host keeps a call alive past its timeout", async () => {
		const { tools, posted, fromHost, clock } = mount({ callTimeoutMs: 20 });
		fromHost({ type: "ready", available: true });
		await tools.ready;
		const call = tools.call("neon", "run_sql", {});
		await flush();
		const { id } = posted.find((m) => m.type === "call") as { id: string };
		for (let i = 0; i < 4; i++) {
			clock.advance(10);
			fromHost({ type: "pending", id });
		}
		fromHost({ type: "result", id, ok: true, result: "late" });
		expect(await call).toBe("late");
	});

	test("refuses args that are not an object before posting", async () => {
		const { tools, posted, fromHost } = mount();
		fromHost({ type: "ready", available: true });
		await tools.ready;
		await expect(tools.call("neon", "run_sql", [1])).rejects.toMatchObject({
			code: "invalid",
		});
		await expect(tools.call("neon", "run_sql", "x")).rejects.toMatchObject({
			code: "invalid",
		});
		expect(posted.filter((m) => m.type === "call")).toEqual([]);
	});

	test("args that cannot be posted reject as invalid and leave nothing pending", async () => {
		const { tools, posted, fromHost } = mount({
			callTimeoutMs: 5,
			postMessage: (m) => {
				if (m.type === "call") throw new Error("DataCloneError");
			},
		});
		fromHost({ type: "ready", available: true });
		await tools.ready;
		await expect(
			tools.call("neon", "run_sql", { fn: () => {} }),
		).rejects.toMatchObject({ code: "invalid" });
		expect(posted.filter((m) => m.type === "call")).toEqual([]);
	});

	test("a result after settling is ignored", async () => {
		const { tools, posted, fromHost } = mount();
		fromHost({ type: "ready", available: true });
		await tools.ready;
		const call = tools.call("neon", "run_sql", {});
		await flush();
		const { id } = posted.find((m) => m.type === "call") as { id: string };
		fromHost({ type: "result", id, ok: true, result: 1 });
		fromHost({ type: "result", id, ok: false, code: "invalid", message: "x" });
		expect(await call).toBe(1);
	});
});
