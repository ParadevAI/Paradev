import {
	hasControlCharacters,
	isCanonicalPathInput,
	isNativeSessionId,
	object,
} from "./native";
import type {
	NativeConversationReference,
	SavedConversationResult,
} from "./types";

export interface T3ConversationReference {
	source: "t3-code";
	format: "t3-provider-thread-v2";
	/** Stable source-store identity supplied by the discovery layer. */
	sourceId: string;
	appThreadId: string;
	providerThreadId: string;
	native: NativeConversationReference;
}

function identifier(value: unknown): value is string {
	return (
		typeof value === "string" &&
		value.length > 0 &&
		value.length <= 512 &&
		value.trim() === value &&
		!hasControlCharacters(value)
	);
}

/** Adapts the v2 provider-thread record, not T3's database or activity state. */
export function adaptT3Conversation(input: {
	format: string;
	sourceId: string;
	appThreadId: string;
	cwd: string;
	providerThread: unknown;
}): SavedConversationResult<T3ConversationReference> {
	if (input.format !== "t3-provider-thread-v2")
		return { ok: false, issue: "unsupported_source" };
	if (
		!identifier(input.sourceId) ||
		!identifier(input.appThreadId) ||
		!isCanonicalPathInput(input.cwd)
	)
		return { ok: false, issue: "invalid_source" };
	const thread = object(input.providerThread);
	if (!thread || !identifier(thread.id))
		return { ok: false, issue: "invalid_source" };
	if (thread.appThreadId !== input.appThreadId)
		return { ok: false, issue: "source_identity_mismatch" };
	if (thread.ownerNodeId !== null)
		return { ok: false, issue: "subagent_transcript" };
	if (thread.status !== "idle") return { ok: false, issue: "source_not_idle" };
	const provider =
		thread.driver === "claudeAgent"
			? "claude"
			: thread.driver === "codex"
				? "codex"
				: null;
	if (!provider) return { ok: false, issue: "unsupported_source" };
	const native = object(thread.nativeThreadRef);
	if (
		!native ||
		native.driver !== thread.driver ||
		native.strength !== "strong" ||
		!isNativeSessionId(native.nativeId)
	)
		return { ok: false, issue: "source_identity_mismatch" };
	let headUuid: string | undefined;
	if (provider === "claude" && thread.nativeConversationHeadRef !== null) {
		const head = object(thread.nativeConversationHeadRef);
		if (
			!head ||
			head.driver !== thread.driver ||
			(head.strength !== "strong" && head.strength !== "weak") ||
			!isNativeSessionId(head.nativeId)
		)
			return { ok: false, issue: "head_mismatch" };
		headUuid = head.nativeId;
	} else if (
		provider === "codex" &&
		thread.nativeConversationHeadRef !== null
	) {
		return { ok: false, issue: "unsupported_source" };
	}
	return {
		ok: true,
		value: {
			source: "t3-code",
			format: "t3-provider-thread-v2",
			sourceId: input.sourceId,
			appThreadId: input.appThreadId,
			providerThreadId: thread.id,
			native: {
				provider,
				sessionId: native.nativeId,
				cwd: input.cwd,
				...(headUuid === undefined ? {} : { headUuid }),
			},
		},
	};
}
