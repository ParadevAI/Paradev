import { afterEach, describe, expect, test } from "bun:test";
import { TerminalAgentStore } from "../../terminal-agents/store";
import { startSandboxAgentStatusReporter } from "./sandbox-agent-status";

const TIMING = {
	settleMs: 5,
	minIntervalMs: 20,
	workingHeartbeatMs: 30,
	retryBaseMs: 5,
	retryMaxMs: 20,
};

type Report = { status: string | null; at: number };

async function until(condition: () => boolean, timeoutMs = 2_000) {
	const deadline = Date.now() + timeoutMs;
	while (!condition()) {
		if (Date.now() > deadline) throw new Error("condition not met in time");
		await new Promise((resolve) => setTimeout(resolve, 5));
	}
}

function chatEvent(store: TerminalAgentStore, eventType: string) {
	store.recordChatEvent({
		terminalId: "terminal",
		workspaceId: "workspace",
		agentId: "claude",
		chatSessionId: "chat",
		eventType,
		occurredAt: Date.now(),
	});
}

let cleanup: (() => void)[] = [];
afterEach(() => {
	for (const fn of cleanup) fn();
	cleanup = [];
});

function startApi(respond: (report: Report) => Promise<Response> | Response) {
	const stored: Report[] = [];
	let inFlight = 0;
	let maxInFlight = 0;
	const server = Bun.serve({
		port: 0,
		async fetch(request) {
			inFlight++;
			maxInFlight = Math.max(maxInFlight, inFlight);
			try {
				const report = (await request.json()) as Report;
				const response = await respond(report);
				if (response.ok) stored.push(report);
				return response;
			} finally {
				inFlight--;
			}
		},
	});
	const store = new TerminalAgentStore();
	const stop = startSandboxAgentStatusReporter({
		apiUrl: `http://localhost:${server.port}`,
		workspaceId: "workspace",
		hostSecret: "secret",
		store,
		timing: TIMING,
	});
	cleanup.push(stop, () => server.stop(true));
	return {
		store,
		stored,
		statuses: () => stored.map((report) => report.status),
		maxInFlight: () => maxInFlight,
	};
}

describe("startSandboxAgentStatusReporter", () => {
	test("retries a failed report so a finished agent does not stay working", async () => {
		let failuresLeft = 0;
		const api = startApi(({ status }) => {
			if (status === "review" && failuresLeft > 0) {
				failuresLeft--;
				return new Response(null, { status: 503 });
			}
			return Response.json({ ok: true });
		});
		await until(() => api.stored.length === 1);
		chatEvent(api.store, "Start");
		await until(() => api.statuses().at(-1) === "working");

		failuresLeft = 2;
		chatEvent(api.store, "Stop");
		await until(() => api.statuses().at(-1) === "review");
		expect(failuresLeft).toBe(0);
	});

	test("sends one report at a time so an older status cannot land last", async () => {
		const api = startApi(async ({ status }) => {
			if (status === "working") {
				await new Promise((resolve) => setTimeout(resolve, 60));
			}
			return Response.json({ ok: true });
		});
		await until(() => api.stored.length === 1);
		chatEvent(api.store, "Start");
		await new Promise((resolve) => setTimeout(resolve, TIMING.minIntervalMs));
		chatEvent(api.store, "Stop");

		await until(() => api.statuses().at(-1) === "review");
		expect(api.statuses()).toEqual([null, "working", "review"]);
		expect(api.maxInFlight()).toBe(1);
	});

	test("repeats working with its original timestamp until the turn ends", async () => {
		const api = startApi(() => Response.json({ ok: true }));
		await until(() => api.stored.length === 1);
		chatEvent(api.store, "Start");
		const working = () => api.stored.filter((r) => r.status === "working");
		await until(() => working().length >= 2);
		expect(new Set(working().map((r) => r.at)).size).toBe(1);

		chatEvent(api.store, "Stop");
		await until(() => api.statuses().at(-1) === "review");
		const count = api.stored.length;
		await new Promise((resolve) =>
			setTimeout(resolve, TIMING.workingHeartbeatMs * 3),
		);
		expect(api.stored.length).toBe(count);
	});
});
