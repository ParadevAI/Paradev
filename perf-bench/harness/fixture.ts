import type { SessionClient } from "@superset/chat/client";
import type { Envelope, SessionState, Turn } from "@superset/chat/protocol";

type StoredItem = { item: Record<string, unknown> & { id: string }; turnId: string };

export type Fixture = {
	session: SessionState;
	turns: Turn[];
	items: StoredItem[];
	cursor: { epoch: string; seq: number };
};

const EPOCH = "bench-epoch";
const T0 = 1_760_000_000_000;

function rng(seed: number) {
	let s = seed >>> 0;
	return () => {
		s = (s * 1664525 + 1013904223) >>> 0;
		return s / 2 ** 32;
	};
}

const WORDS =
	"render commit snapshot stream delta timeline row memo context provider transcript worktree session agent turn tool call markdown parser layout paint frame budget scheduler reconcile fiber hook effect state store selector query cache".split(
		" ",
	);

function sentence(r: () => number, n: number): string {
	const out: string[] = [];
	for (let i = 0; i < n; i++) out.push(WORDS[Math.floor(r() * WORDS.length)] ?? "x");
	const s = out.join(" ");
	return s[0]?.toUpperCase() + s.slice(1) + ".";
}

export function agentMarkdown(r: () => number, paragraphs: number): string {
	const parts: string[] = [];
	parts.push(`## ${sentence(r, 4).slice(0, -1)}`);
	for (let p = 0; p < paragraphs; p++) {
		parts.push(`${sentence(r, 14)} ${sentence(r, 10)} Use \`useMemo\` around \`deriveTimeline\` here.`);
		if (p % 2 === 0) {
			parts.push(
				[1, 2, 3].map((i) => `${i}. ${sentence(r, 7)}`).join("\n"),
			);
		} else {
			parts.push(["- ", "- ", "- "].map((b) => b + sentence(r, 6)).join("\n"));
		}
	}
	parts.push(
		"```ts\nexport function f(items: Item[]) {\n  return items.filter((item) => item.kind === \"tool_call\").map((item) => item.id);\n}\n```",
	);
	return parts.join("\n\n");
}

/** A long finished chat: `turnCount` turns of prompt, tool calls and a markdown reply. */
export function buildFixture(turnCount: number): Fixture {
	const r = rng(42);
	const turns: Turn[] = [];
	const items: StoredItem[] = [];
	let t = T0;
	for (let i = 0; i < turnCount; i++) {
		const turnId = `turn-${i}`;
		const start = t;
		const push = (item: Record<string, unknown> & { id: string }) =>
			items.push({ item, turnId });
		push({
			id: `u-${i}`,
			kind: "user_message",
			startedAtMs: t++,
			completedAtMs: t,
			content: [{ type: "text", text: sentence(r, 12) }],
		});
		push({
			id: `a0-${i}`,
			kind: "agent_message",
			startedAtMs: t++,
			completedAtMs: t,
			text: sentence(r, 18),
		});
		const tools = 2 + Math.floor(r() * 4);
		for (let k = 0; k < tools; k++) {
			const execute = k % 2 === 0;
			push({
				id: `tc-${i}-${k}`,
				kind: "tool_call",
				startedAtMs: t++,
				completedAtMs: t,
				title: execute ? `bun test src/file${k}.test.ts` : `Read src/module${k}.ts`,
				toolKind: execute ? "execute" : "read",
				toolName: execute ? "Bash" : "Read",
				status: "completed",
				locations: execute ? undefined : [{ path: `src/module${k}.ts`, line: 10 }],
				content: execute
					? [
							{
								type: "terminal",
								command: `bun test src/file${k}.test.ts`,
								output: `${sentence(r, 10)}\n${sentence(r, 10)}\n 12 pass\n 0 fail`,
								exitCode: 0,
							},
						]
					: [{ type: "text", text: sentence(r, 30) }],
			});
		}
		push({
			id: `a1-${i}`,
			kind: "agent_message",
			startedAtMs: t++,
			completedAtMs: t,
			text: agentMarkdown(r, 2 + Math.floor(r() * 3)),
		});
		turns.push({
			id: turnId,
			status: "completed",
			startedAtMs: start,
			completedAtMs: t,
			usage: { inputTokens: 1000, cachedInputTokens: 500, outputTokens: 300 },
		});
		t += 1000;
	}
	return {
		session: {
			status: "idle",
			harness: "claude",
			title: "Bench chat",
			modeId: "default",
		} as SessionState,
		turns,
		items,
		cursor: { epoch: EPOCH, seq: items.length + turns.length },
	};
}

export type StreamPlan = {
	updates: number;
	intervalMs: number;
};

/**
 * A client whose host already holds `fixture`, and which streams one new
 * turn when `start` is called: a prompt, then `updates` text deltas.
 */
export function createBenchClient(fixture: Fixture) {
	let onEnvelope: ((envelope: Envelope) => void) | null = null;
	let seq = fixture.cursor.seq;
	const sessionId = "bench-session";
	const envelope = (event: unknown): Envelope =>
		({
			v: 1,
			sessionId,
			ts: Date.now(),
			cursor: { epoch: EPOCH, seq: ++seq },
			event,
		}) as Envelope;
	const delta = (itemId: string, append: string): Envelope =>
		({
			v: 1,
			sessionId,
			ts: Date.now(),
			delta: { type: "text", itemId, append },
		}) as Envelope;
	let connected: () => void = () => {};
	const ready = new Promise<void>((resolve) => {
		connected = resolve;
	});

	const unsupported = async () => "unsupported" as const;
	const noop = async () => {};
	const client = {
		sessionId,
		getSession: async () => ({
			live: true,
			session: { ...fixture.session, epoch: EPOCH },
			cursor: fixture.cursor,
		}),
		getOutline: async () => ({
			ok: true,
			outline: {
				session: fixture.session,
				turns: fixture.turns,
				items: fixture.items,
				cursor: fixture.cursor,
			},
		}),
		getItems: async () => ({ ok: true, envelopes: [], nextBefore: null }),
		getItemBodies: async () => ({ ok: true, items: [] }),
		getTurnChanges: unsupported,
		undoTurnFiles: unsupported,
		prompt: async () => ({ ok: true }),
		removeQueuedPrompt: noop,
		steerQueuedPrompt: noop,
		updateQueuedPrompt: noop,
		resumeQueue: noop,
		respondToUsageLimit: noop,
		cancelTurn: noop,
		stopBackgroundTask: async () => true,
		steerSubagent: unsupported,
		backgroundSubagent: unsupported,
		respondToApproval: noop,
		setMode: noop,
		setConfigOption: noop,
		subscribe: (options: {
			onEnvelope(envelope: Envelope): void;
			onStatusChange?(status: string): void;
		}) => {
			onEnvelope = options.onEnvelope;
			queueMicrotask(() => {
				options.onStatusChange?.("open");
				connected();
			});
			return {
				close: () => {
					onEnvelope = null;
				},
			};
		},
		close: () => {},
	} as unknown as SessionClient;

	const start = async (
		plan: StreamPlan,
		onUpdate: (index: number) => void,
	): Promise<void> => {
		await ready;
		const emit = (e: Envelope) => onEnvelope?.(e);
		const r = rng(7);
		const turnId = "turn-live";
		const now = Date.now();
		emit(
			envelope({
				type: "turn",
				turn: { id: turnId, status: "running", startedAtMs: now },
			}),
		);
		emit(
			envelope({
				type: "item",
				turnId,
				item: {
					id: "u-live",
					kind: "user_message",
					startedAtMs: now,
					content: [{ type: "text", text: "Explain the render path." }],
				},
			}),
		);
		emit(
			envelope({
				type: "item",
				turnId,
				item: { id: "a-live", kind: "agent_message", startedAtMs: now + 1, text: "" },
			}),
		);
		const full = agentMarkdown(r, 40);
		const chunk = Math.max(4, Math.ceil(full.length / plan.updates));
		await new Promise((resolve) => setTimeout(resolve, 300));
		for (let i = 0; i < plan.updates; i++) {
			emit(delta("a-live", full.slice(i * chunk, (i + 1) * chunk)));
			onUpdate(i);
			await new Promise((resolve) => setTimeout(resolve, plan.intervalMs));
		}
	};

	return { client, start };
}
