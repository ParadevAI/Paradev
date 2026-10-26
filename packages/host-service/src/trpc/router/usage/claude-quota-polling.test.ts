import { expect, test } from "bun:test";
import {
	CLAUDE_ACTIVE_QUOTA_POLL_MS,
	CLAUDE_IDLE_QUOTA_POLL_MS,
	createClaudeQuotaPolling,
} from "./claude-quota-polling";

function binding(at: number) {
	return {
		agentId: "claude",
		agentSessionId: "chat",
		confirmedSessionId: "chat",
		lastEventAt: at,
		account: {
			agent: "claude",
			credentialKind: "subscription",
			selection: "/profiles/active",
			identity: "verified",
		},
	};
}

test("recent exact account activity speeds only that profile and naturally returns to idle", () => {
	let now = 1_000_000;
	const polling = createClaudeQuotaPolling(() => now);
	polling.register(() => [binding(1_000_000)]);
	expect(polling.interval("/profiles/active")).toBe(
		CLAUDE_ACTIVE_QUOTA_POLL_MS,
	);
	expect(polling.interval("/profiles/sibling")).toBe(CLAUDE_IDLE_QUOTA_POLL_MS);
	expect(polling.interval(null)).toBe(CLAUDE_IDLE_QUOTA_POLL_MS);
	now += 5 * 60_000;
	expect(polling.interval("/profiles/active")).toBe(CLAUDE_IDLE_QUOTA_POLL_MS);
});

test("recent imported activity can speed scheduling without granting native quota authority", () => {
	const polling = createClaudeQuotaPolling(() => 1_000_000);
	polling.register(() => [
		{ ...binding(1_000_000), confirmedSessionId: undefined },
	]);
	expect(polling.interval("/profiles/active")).toBe(
		CLAUDE_ACTIVE_QUOTA_POLL_MS,
	);
	expect(polling.interval("/profiles/sibling")).toBe(CLAUDE_IDLE_QUOTA_POLL_MS);
});

test("ended, conflicting, foreign, future and nonfinite activity stays idle", () => {
	const now = 1_000_000;
	for (const change of [
		{ confirmedSessionId: "different" },
		{ agentSessionId: "" },
		{ endedAt: now },
		{ failureType: "session_identity_conflict" },
		{ agentId: "codex" },
		{ accountInvalid: true },
		{ account: { ...binding(now).account, conflict: true } },
		{ lastEventAt: now + 1 },
		{ lastEventAt: Number.NaN },
		{ account: { ...binding(now).account, credentialKind: "api-key" } },
		{ account: { ...binding(now).account, identity: "" } },
		{ account: { ...binding(now).account, agent: "codex" } },
	]) {
		const polling = createClaudeQuotaPolling(() => now);
		polling.register(() => [{ ...binding(now), ...change }]);
		expect(polling.interval("/profiles/active")).toBe(
			CLAUDE_IDLE_QUOTA_POLL_MS,
		);
	}
});

test("activity owners unregister independently, even when sharing one callback", () => {
	const polling = createClaudeQuotaPolling(() => 1_000_000);
	const source = () => [binding(1_000_000)];
	const first = polling.register(source);
	const second = polling.register(source);
	polling.register(() => {
		throw new Error("unavailable source");
	});
	first();
	first();
	expect(polling.interval("/profiles/active")).toBe(
		CLAUDE_ACTIVE_QUOTA_POLL_MS,
	);
	second();
	expect(polling.interval("/profiles/active")).toBe(CLAUDE_IDLE_QUOTA_POLL_MS);
});
