import { describe, expect, test } from "bun:test";
import type { SDKUserMessage } from "@anthropic-ai/claude-agent-sdk";
import { attachedFilesBlock } from "../../attachedFiles";
import type { AdapterEvent, ResolveAttachment } from "../../types";
import {
	ClaudeAdapter,
	type ClaudeQuery,
	type ClaudeSession,
} from "./claudeAdapter";

type Harness = {
	adapter: ClaudeAdapter;
	iterator: AsyncIterator<AdapterEvent>;
	emit: (message: unknown) => void;
	interrupts: number;
	aborted: () => boolean;
};

function messageStart(id: string): unknown {
	return {
		type: "stream_event",
		event: { type: "message_start", message: { id } },
	};
}

function result(): unknown {
	return {
		type: "result",
		subtype: "success",
		is_error: false,
		usage: { input_tokens: 1, output_tokens: 1 },
	};
}

function createHarness(): Harness {
	const pending: unknown[] = [];
	let notify: (() => void) | null = null;
	let aborted = false;
	const state = { interrupts: 0 };

	const stream: ClaudeSession = {
		async *[Symbol.asyncIterator]() {
			while (true) {
				const next = pending.shift();
				if (next !== undefined) {
					yield next;
					continue;
				}
				await new Promise<void>((resolve) => {
					notify = resolve;
				});
			}
		},
		interrupt: async () => {
			state.interrupts += 1;
		},
	};

	const query: ClaudeQuery = ({ options }) => {
		options.abortController?.signal.addEventListener("abort", () => {
			aborted = true;
		});
		return stream;
	};

	const adapter = new ClaudeAdapter({ query });
	const iterator = adapter.start({ cwd: "/workspace" })[Symbol.asyncIterator]();

	return {
		adapter,
		iterator,
		emit: (message: unknown) => {
			pending.push(message);
			const resume = notify;
			notify = null;
			resume?.();
		},
		get interrupts() {
			return state.interrupts;
		},
		aborted: () => aborted,
	};
}

async function nextTurn(
	iterator: AsyncIterator<AdapterEvent>,
): Promise<AdapterEvent> {
	for (let index = 0; index < 20; index += 1) {
		const next = await iterator.next();
		if (next.done) throw new Error("stream ended");
		if (next.value.kind === "turn") return next.value;
	}
	throw new Error("no turn event");
}

describe("ClaudeAdapter", () => {
	test("a canceled turn interrupts the session without killing it, and the next prompt runs", async () => {
		const harness = createHarness();

		harness.adapter.prompt([{ type: "text", text: "first" }]);
		harness.emit(messageStart("msg_1"));
		const firstTurn = await nextTurn(harness.iterator);
		expect(firstTurn).toMatchObject({ turn: { status: "running" } });

		harness.adapter.cancelTurn();
		expect(harness.interrupts).toBe(1);
		expect(harness.aborted()).toBe(false);

		harness.emit(result());
		const canceled = await nextTurn(harness.iterator);
		expect(canceled).toMatchObject({ turn: { status: "interrupted" } });

		harness.adapter.prompt([{ type: "text", text: "second" }]);
		harness.emit(messageStart("msg_2"));
		const secondTurn = await nextTurn(harness.iterator);
		expect(secondTurn).toMatchObject({ turn: { status: "running" } });
		expect(
			secondTurn.kind === "turn" && firstTurn.kind === "turn"
				? secondTurn.turn.id !== firstTurn.turn.id
				: false,
		).toBe(true);
	});

	test("reports the session id the stream carries, once", async () => {
		const harness = createHarness();
		const reported: string[] = [];
		const collect = async () => {
			for (let index = 0; index < 20; index += 1) {
				const next = await harness.iterator.next();
				if (next.done) return;
				if (next.value.kind === "turn") return;
				if (
					next.value.kind === "session" &&
					next.value.session.harnessSessionId
				)
					reported.push(next.value.session.harnessSessionId);
			}
		};

		harness.adapter.prompt([{ type: "text", text: "first" }]);
		harness.emit({ type: "system", subtype: "init", session_id: "session-1" });
		harness.emit({
			...(messageStart("msg_1") as object),
			session_id: "session-1",
		});
		await collect();

		expect(reported).toEqual(["session-1"]);
	});

	test("dispose aborts the underlying session", async () => {
		const harness = createHarness();
		harness.adapter.prompt([{ type: "text", text: "first" }]);
		harness.emit(messageStart("msg_1"));
		await nextTurn(harness.iterator);

		const disposal = harness.adapter.dispose();
		expect(harness.aborted()).toBe(true);
		harness.emit(result());
		await Promise.race([
			disposal,
			new Promise((resolve) => setTimeout(resolve, 50)),
		]);
	});
});

describe("ClaudeAdapter permission modes", () => {
	test("starts in full access when no mode is requested", async () => {
		let startMode: string | undefined;
		const stream: ClaudeSession = {
			async *[Symbol.asyncIterator]() {
				await new Promise(() => undefined);
			},
		};
		const query: ClaudeQuery = ({ options }) => {
			startMode = options.permissionMode;
			return stream;
		};
		const adapter = new ClaudeAdapter({ query });
		const iterator = adapter
			.start({ cwd: "/workspace" })
			[Symbol.asyncIterator]();

		const first = await iterator.next();
		expect(first.value).toMatchObject({
			kind: "session",
			session: { modeId: "bypassPermissions" },
		});
		await Bun.sleep(0);
		expect(startMode).toBe("bypassPermissions");
	});

	test("resumes without a requested mode in ask-for-approval, not full access", async () => {
		let startMode: string | undefined;
		const stream: ClaudeSession = {
			async *[Symbol.asyncIterator]() {
				await new Promise(() => undefined);
			},
		};
		const query: ClaudeQuery = ({ options }) => {
			startMode = options.permissionMode;
			return stream;
		};
		const adapter = new ClaudeAdapter({ query });
		const iterator = adapter
			.start({ cwd: "/workspace", resume: { harnessSessionId: "s-1" } })
			[Symbol.asyncIterator]();

		const first = await iterator.next();
		expect(first.value).toMatchObject({ session: { modeId: "default" } });
		await Bun.sleep(0);
		expect(startMode).toBe("default");
	});

	test("starts in the requested mode and switches the live session on setMode", async () => {
		const modes: string[] = [];
		let startMode: string | undefined;
		const stream: ClaudeSession = {
			async *[Symbol.asyncIterator]() {
				await new Promise(() => undefined);
			},
			setPermissionMode: async (mode) => {
				modes.push(mode);
			},
		};
		const query: ClaudeQuery = ({ options }) => {
			startMode = options.permissionMode;
			return stream;
		};
		const adapter = new ClaudeAdapter({ query });
		const iterator = adapter
			.start({ cwd: "/workspace", modeId: "acceptEdits" })
			[Symbol.asyncIterator]();

		const first = await iterator.next();
		expect(first.value).toMatchObject({
			kind: "session",
			session: { modeId: "acceptEdits" },
		});
		await Bun.sleep(0);
		expect(startMode).toBe("acceptEdits");

		adapter.setMode("bypassPermissions");
		adapter.setMode("not-a-mode");
		expect(modes).toEqual(["bypassPermissions", "default"]);
	});

	test("reports the previous mode again when the session rejects a switch", async () => {
		const stream: ClaudeSession = {
			async *[Symbol.asyncIterator]() {
				await new Promise(() => undefined);
			},
			setPermissionMode: async () => {
				throw new Error("rejected");
			},
		};
		const adapter = new ClaudeAdapter({ query: () => stream });
		const iterator = adapter
			.start({ cwd: "/workspace", modeId: "default" })
			[Symbol.asyncIterator]();
		await iterator.next();
		await Bun.sleep(0);

		adapter.setMode("bypassPermissions");
		const switched = await iterator.next();
		const reverted = await iterator.next();
		expect(switched.value).toMatchObject({
			session: { modeId: "bypassPermissions" },
		});
		expect(reverted.value).toMatchObject({ session: { modeId: "default" } });
	});
});

describe("ClaudeAdapter attachments", () => {
	function capturePrompts(resolveAttachment: ResolveAttachment) {
		const sent: SDKUserMessage[] = [];
		const stream: ClaudeSession = {
			async *[Symbol.asyncIterator]() {
				await new Promise(() => {});
			},
		};
		const adapter = new ClaudeAdapter({
			resolveAttachment,
			query: ({ prompt }) => {
				void (async () => {
					for await (const message of prompt as AsyncIterable<SDKUserMessage>)
						sent.push(message);
				})();
				return stream;
			},
		});
		adapter.start({ cwd: "/workspace" });
		return { adapter, sent };
	}

	const flush = () => new Promise((resolve) => setTimeout(resolve, 0));
	const part = (name: string, mimeType: string) => ({
		type: "attachment" as const,
		attachmentId: name,
		name,
		mimeType,
	});

	test("sends an image as an image block", async () => {
		const { adapter, sent } = capturePrompts(async () => ({
			path: "/store/a/a.png",
			mimeType: "image/png",
			data: "cG5n",
		}));
		adapter.prompt([
			{ type: "text", text: "what is this" },
			part("shot.png", "image/png"),
		]);
		await flush();
		expect(sent.map((message) => message.message.content)).toEqual([
			[
				{ type: "text", text: "what is this" },
				{
					type: "image",
					source: { type: "base64", media_type: "image/png", data: "cG5n" },
				},
			],
		]);
	});

	test("hands a non-image over as its name and path", async () => {
		const { adapter, sent } = capturePrompts(async () => ({
			path: "/store/b/b.pdf",
			mimeType: "application/pdf",
			data: "cGRm",
		}));
		adapter.prompt([part("spec.pdf", "application/pdf")]);
		await flush();
		expect(sent[0]?.message.content).toEqual([
			{
				type: "text",
				text: attachedFilesBlock([
					{ name: "spec.pdf", path: "/store/b/b.pdf" },
				]),
			},
		]);
	});

	test("tells the agent which file it could not read", async () => {
		const { adapter, sent } = capturePrompts(async () => null);
		adapter.prompt([part("gone.png", "image/png")]);
		await flush();
		expect(sent[0]?.message.content).toEqual([
			{ type: "text", text: "[gone.png: could not be read]" },
		]);
	});

	test("a prompt sent while an attachment resolves still goes second", async () => {
		let release: () => void = () => {};
		const { adapter, sent } = capturePrompts(
			() =>
				new Promise((resolve) => {
					release = () =>
						resolve({
							path: "/store/c/c.png",
							mimeType: "image/png",
							data: "",
						});
				}),
		);
		adapter.prompt([part("first.png", "image/png")]);
		adapter.prompt([{ type: "text", text: "second" }]);
		await flush();
		expect(sent).toEqual([]);
		release();
		await flush();
		expect(sent.map((message) => message.message.content)).toEqual([
			[
				{
					type: "image",
					source: { type: "base64", media_type: "image/png", data: "" },
				},
			],
			[{ type: "text", text: "second" }],
		]);
	});
});
