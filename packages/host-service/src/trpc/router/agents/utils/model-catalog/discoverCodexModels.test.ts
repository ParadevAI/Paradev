import { describe, expect, test } from "bun:test";
import type {
	CodexTransport,
	CodexTransportHandlers,
} from "@superset/chat-runtime";
import { discoverCodexModels } from "./discoverCodexModels";

type Reply = (method: string, params: unknown) => unknown;

function fakeAppServer(reply: Reply) {
	const methods: string[] = [];
	let closed = false;
	const createTransport = (
		handlers: CodexTransportHandlers,
	): CodexTransport => ({
		send: (line) => {
			const frame = JSON.parse(line) as {
				id?: number;
				method: string;
				params?: unknown;
			};
			methods.push(frame.method);
			if (frame.id === undefined) return;
			const result = reply(frame.method, frame.params);
			if (result === undefined) return;
			queueMicrotask(() =>
				handlers.onLine(JSON.stringify({ id: frame.id, result })),
			);
		},
		close: async () => {
			closed = true;
		},
	});
	return { createTransport, methods, isClosed: () => closed };
}

const initialize = { userAgent: "codex_cli_rs/0.162.1" };

function model(id: string, efforts: string[], extra: object = {}) {
	return {
		id: `entry-${id}`,
		model: id,
		isDefault: false,
		defaultReasoningEffort: efforts[0],
		displayName: id.toUpperCase(),
		hidden: false,
		supportedReasoningEfforts: efforts.map((reasoningEffort) => ({
			reasoningEffort,
		})),
		...extra,
	};
}

describe("discoverCodexModels", () => {
	test("initializes, includes hidden models, preserves order and execution identifiers", async () => {
		const server = fakeAppServer((method, params) => {
			if (method === "initialize") return initialize;
			expect((params as { includeHidden?: boolean }).includeHidden).toBe(true);
			const cursor = (params as { cursor?: string }).cursor;
			if (!cursor) {
				return {
					data: [
						model("gpt-6.1-sol", ["low", "ultra"]),
						model("gpt-internal", ["low"], { hidden: true }),
					],
					nextCursor: "page-2",
				};
			}
			return { data: [model("gpt-7-nova", ["turbo"])], nextCursor: null };
		});

		const catalog = await discoverCodexModels({
			command: "codex",
			env: {},
			timeoutMs: 1_000,
			createTransport: server.createTransport,
		});

		expect(catalog.models).toEqual([
			{
				id: "gpt-6.1-sol",
				label: "GPT-6.1-SOL",
				hidden: false,
				isDefault: false,
				defaultReasoningEffort: "low",
			},
			{
				id: "gpt-internal",
				label: "GPT-INTERNAL",
				hidden: true,
				isDefault: false,
				defaultReasoningEffort: "low",
			},
			{
				id: "gpt-7-nova",
				label: "GPT-7-NOVA",
				hidden: false,
				isDefault: false,
				defaultReasoningEffort: "turbo",
			},
		]);
		expect(catalog.efforts["gpt-7-nova"]).toEqual(["turbo"]);
		expect(server.methods).toEqual([
			"initialize",
			"initialized",
			"model/list",
			"model/list",
		]);
		expect(server.isClosed()).toBe(true);
	});

	test("gives up and closes the server when it does not answer", async () => {
		const server = fakeAppServer((method) =>
			method === "initialize" ? initialize : undefined,
		);
		await expect(
			discoverCodexModels({
				command: "codex",
				env: {},
				timeoutMs: 20,
				createTransport: server.createTransport,
			}),
		).rejects.toThrow("timed out");
		expect(server.isClosed()).toBe(true);
	});
});

test("rejects repeated pagination cursors and closes the transport", async () => {
	const server = fakeAppServer((method) =>
		method === "initialize" ? initialize : { data: [], nextCursor: "same" },
	);
	await expect(
		discoverCodexModels({
			command: "codex",
			env: {},
			timeoutMs: 1000,
			createTransport: server.createTransport,
		}),
	).rejects.toThrow("Repeated");
	expect(server.isClosed()).toBe(true);
});
