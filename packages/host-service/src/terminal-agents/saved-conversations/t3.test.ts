import { describe, expect, test } from "bun:test";
import { adaptT3Conversation, validateNativeConversation } from ".";

const NATIVE = "11111111-1111-4111-8111-111111111111";
const HEAD = "22222222-2222-4222-8222-222222222222";
const OTHER = "33333333-3333-4333-8333-333333333333";
const base = {
	format: "t3-provider-thread-v2",
	sourceId: "store-a",
	appThreadId: "app-thread-a",
	cwd: "/work/project",
} as const;
function thread(overrides: Record<string, unknown> = {}) {
	return {
		id: "provider-thread-a",
		appThreadId: base.appThreadId,
		driver: "claudeAgent",
		ownerNodeId: null,
		status: "idle",
		nativeThreadRef: {
			driver: "claudeAgent",
			nativeId: NATIVE,
			strength: "strong",
		},
		nativeConversationHeadRef: null,
		...overrides,
	};
}

describe("T3 v2 saved conversation references", () => {
	test("keeps source, app, provider and native identities distinct", () => {
		expect(adaptT3Conversation({ ...base, providerThread: thread() })).toEqual({
			ok: true,
			value: {
				source: "t3-code",
				format: base.format,
				sourceId: base.sourceId,
				appThreadId: base.appThreadId,
				providerThreadId: "provider-thread-a",
				native: { provider: "claude", sessionId: NATIVE, cwd: base.cwd },
			},
		});
	});

	test("maps Codex's native reference without applying Claude cursor rules", () => {
		const result = adaptT3Conversation({
			...base,
			providerThread: thread({
				driver: "codex",
				nativeThreadRef: {
					driver: "codex",
					nativeId: NATIVE,
					strength: "strong",
				},
			}),
		});
		expect(result.ok && result.value.native).toEqual({
			provider: "codex",
			sessionId: NATIVE,
			cwd: base.cwd,
		});
	});

	test("does not silently treat legacy cursor data as current provider-thread data", () => {
		expect(
			adaptT3Conversation({
				...base,
				format: "t3-runtime-v1",
				providerThread: { resume: NATIVE, resumeSessionAt: HEAD },
			}),
		).toEqual({ ok: false, issue: "unsupported_source" });
	});

	test("refuses another app thread and a worker owned by an execution node", () => {
		expect(
			adaptT3Conversation({
				...base,
				providerThread: thread({ appThreadId: "another-chat" }),
			}),
		).toEqual({ ok: false, issue: "source_identity_mismatch" });
		expect(
			adaptT3Conversation({
				...base,
				providerThread: thread({ ownerNodeId: "subagent-node" }),
			}),
		).toEqual({ ok: false, issue: "subagent_transcript" });
	});

	test.each([
		"running",
		"starting",
		"unknown",
		undefined,
	])("refuses a provider thread not recorded idle: %j", (status) => {
		expect(
			adaptT3Conversation({ ...base, providerThread: thread({ status }) }),
		).toEqual({ ok: false, issue: "source_not_idle" });
	});

	test.each([
		null,
		{ driver: "claudeAgent", nativeId: NATIVE, strength: "weak" },
		{ driver: "codex", nativeId: NATIVE, strength: "strong" },
		{ driver: "claudeAgent", nativeId: "latest", strength: "strong" },
	])("requires a strong, provider-matching native reference: %j", (native) => {
		expect(
			adaptT3Conversation({
				...base,
				providerThread: thread({ nativeThreadRef: native }),
			}),
		).toEqual({ ok: false, issue: "source_identity_mismatch" });
	});

	test("preserves a weak rollback cursor until native transcript validation", () => {
		const result = adaptT3Conversation({
			...base,
			providerThread: thread({
				nativeConversationHeadRef: {
					driver: "claudeAgent",
					nativeId: HEAD,
					strength: "weak",
				},
			}),
		});
		expect(result.ok).toBe(true);
		if (!result.ok) return;
		const snapshot = {
			canonicalPath: "/profiles/claude/saved.jsonl",
			complete: true,
			content: JSON.stringify({
				type: "assistant",
				sessionId: NATIVE,
				cwd: base.cwd,
				uuid: OTHER,
				message: { content: "A later branch" },
			}),
		};
		expect(validateNativeConversation(result.value.native, [snapshot])).toEqual(
			{
				ok: false,
				issue: "head_mismatch",
			},
		);
		expect(
			validateNativeConversation(result.value.native, [
				{ ...snapshot, content: snapshot.content.replace(OTHER, HEAD) },
			]).ok,
		).toBe(true);
	});

	test.each([
		undefined,
		{ driver: "codex", nativeId: HEAD, strength: "weak" },
		{ driver: "claudeAgent", nativeId: null, strength: "weak" },
	])("rejects an unknown or conflicting Claude head: %j", (head) => {
		expect(
			adaptT3Conversation({
				...base,
				providerThread: thread({ nativeConversationHeadRef: head }),
			}),
		).toEqual({ ok: false, issue: "head_mismatch" });
	});

	test("does not merge distinct source chats sharing a folder or native reference", () => {
		const first = adaptT3Conversation({ ...base, providerThread: thread() });
		const second = adaptT3Conversation({
			...base,
			appThreadId: "app-thread-b",
			providerThread: thread({ appThreadId: "app-thread-b" }),
		});
		expect(first.ok && second.ok).toBe(true);
		if (first.ok && second.ok)
			expect(first.value.appThreadId).not.toBe(second.value.appThreadId);
	});

	test.each([
		{ providerThread: null },
		{ providerThread: [] },
		{ providerThread: {} },
		{ providerThread: { id: "\n" } },
	])("refuses malformed provider metadata: %j", ({ providerThread }) => {
		expect(adaptT3Conversation({ ...base, providerThread })).toEqual({
			ok: false,
			issue: "invalid_source",
		});
	});
});
