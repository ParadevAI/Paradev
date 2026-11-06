import { describe, expect, it } from "bun:test";
import { AcpAdapter } from "./acpAdapter";
import type { AcpTransport, AcpTransportHandlers } from "./rpcClient";

class ListingAgent {
	protocolVersion = 1;
	capabilities: Record<string, unknown> = {
		sessionCapabilities: { list: {} },
	};
	pages: Array<Record<string, unknown>> = [];
	listError: { code: number; message: string } | null = null;
	readonly sent: Array<{ method?: string; params?: Record<string, unknown> }> =
		[];
	closed = 0;
	private handlers!: AcpTransportHandlers;

	transport(_options: unknown, handlers: AcpTransportHandlers): AcpTransport {
		this.handlers = handlers;
		return {
			send: (line) => this.onSend(line),
			close: async () => {
				this.closed += 1;
			},
		};
	}

	private onSend(line: string): void {
		const frame = JSON.parse(line) as {
			id?: number;
			method?: string;
			params?: Record<string, unknown>;
		};
		this.sent.push(frame);
		if (frame.id === undefined || !frame.method) return;
		const id = frame.id;
		const method = frame.method;
		queueMicrotask(() => {
			if (method === "initialize") {
				this.deliver(id, {
					protocolVersion: this.protocolVersion,
					...(this.protocolVersion >= 2
						? { capabilities: this.capabilities }
						: { agentCapabilities: this.capabilities }),
				});
				return;
			}
			if (method === "session/list") {
				if (this.listError) {
					this.handlers.onLine(
						JSON.stringify({
							jsonrpc: "2.0",
							id,
							error: this.listError,
						}),
					);
					return;
				}
				this.deliver(id, this.pages.shift() ?? { sessions: [] });
				return;
			}
			if (method === "session/new" || method === "session/load") {
				this.deliver(id, { sessionId: "should-not-open" });
			}
		});
	}

	private deliver(id: number, result: unknown): void {
		this.handlers.onLine(JSON.stringify({ jsonrpc: "2.0", id, result }));
	}
}

function adapterFor(agent: ListingAgent): AcpAdapter {
	return new AcpAdapter({
		command: "fake",
		createTransport: (options, handlers) => agent.transport(options, handlers),
		startupTimeoutMs: 50,
		requestTimeoutMs: 50,
	});
}

describe("ACP native session list", () => {
	it("does not list or open a session when the agent does not advertise listing", async () => {
		for (const [protocolVersion, capabilities] of [
			[1, { sessionCapabilities: { fork: {} } }],
			[1, { sessionCapabilities: { list: null } }],
			[2, {}],
		] as const) {
			const agent = new ListingAgent();
			agent.protocolVersion = protocolVersion;
			agent.capabilities = capabilities;
			const adapter = adapterFor(agent);
			await expect(
				adapter.discoverSessions({ cwd: "/work/repo" }),
			).resolves.toEqual({ supported: false, sessions: [] });
			expect(agent.sent.map((frame) => frame.method)).toEqual(["initialize"]);
			await adapter.dispose();
			expect(agent.closed).toBe(1);
		}
	});

	it("passes cwd and cursor through session/list and pages the result", async () => {
		const agent = new ListingAgent();
		agent.pages = [
			{
				sessions: [
					{
						sessionId: "native-1",
						cwd: "/work/repo",
						title: "Fix the flaky test",
						updatedAt: "2026-04-01T12:00:00Z",
					},
					{
						sessionId: "native-2",
						cwd: "/work/repo",
						title: null,
						updatedAt: null,
					},
				],
				nextCursor: "page-2",
			},
			{
				sessions: [
					{
						sessionId: "native-3",
						cwd: "/work/repo",
						title: "Older",
					},
				],
			},
		];
		const adapter = adapterFor(agent);

		await expect(
			adapter.discoverSessions({ cwd: "/work/repo" }),
		).resolves.toEqual({
			supported: true,
			sessions: [
				{
					sessionId: "native-1",
					cwd: "/work/repo",
					title: "Fix the flaky test",
					updatedAt: "2026-04-01T12:00:00Z",
				},
				{ sessionId: "native-2", cwd: "/work/repo" },
			],
			nextCursor: "page-2",
		});
		await expect(
			adapter.discoverSessions({ cwd: "/work/repo", cursor: "page-2" }),
		).resolves.toEqual({
			supported: true,
			sessions: [{ sessionId: "native-3", cwd: "/work/repo", title: "Older" }],
		});

		const listed = agent.sent.filter(
			(frame) => frame.method === "session/list",
		);
		expect(listed.map((frame) => frame.params)).toEqual([
			{ cwd: "/work/repo" },
			{ cwd: "/work/repo", cursor: "page-2" },
		]);
		expect(agent.sent.map((frame) => frame.method)).toEqual([
			"initialize",
			"session/list",
			"session/list",
		]);
		await adapter.dispose();
		expect(agent.closed).toBe(1);
	});

	it("lists on v2 when capabilities.session is present", async () => {
		const agent = new ListingAgent();
		agent.protocolVersion = 2;
		agent.capabilities = { session: {} };
		agent.pages = [
			{ sessions: [{ sessionId: "v2-1", cwd: "/work/repo", title: "v2" }] },
		];
		const adapter = adapterFor(agent);
		await expect(
			adapter.discoverSessions({ cwd: "/work/repo" }),
		).resolves.toMatchObject({
			supported: true,
			sessions: [{ sessionId: "v2-1", cwd: "/work/repo", title: "v2" }],
		});
		await adapter.dispose();
	});

	it("propagates a session/list failure and still closes the process", async () => {
		const agent = new ListingAgent();
		agent.listError = { code: -32603, message: "history unreadable" };
		const adapter = adapterFor(agent);

		await expect(
			adapter.discoverSessions({ cwd: "/work/repo" }),
		).rejects.toThrow(/history unreadable/);
		expect(agent.sent.some((frame) => frame.method === "session/new")).toBe(
			false,
		);
		await adapter.dispose();
		expect(agent.closed).toBe(1);
	});
});
