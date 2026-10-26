import { randomUUID } from "node:crypto";
import {
	captureNativeClaudeUsageGeneration,
	resolveNativeClaudeUsageScope,
} from "../trpc/router/usage/claude";
import {
	ingestNativeClaudeBinding,
	isNativeClaudeAccount,
	type NativeClaudeAccount,
	type NativeClaudeUsageDependencies,
} from "../trpc/router/usage/native-claude-binding";
import { nativeClaudeUsage } from "../trpc/router/usage/native-claude-usage";
import { validateSessionAccount } from "../trpc/router/usage/session-account/session-account";

const dependencies: NativeClaudeUsageDependencies = {
	captureGeneration: captureNativeClaudeUsageGeneration,
	resolveScope: resolveNativeClaudeUsageScope,
	validateAccount: validateSessionAccount,
	store: nativeClaudeUsage,
};
export function createNativeClaudeChatFeed(
	deps = dependencies,
	now = Date.now,
) {
	const launchId = randomUUID();
	let launched: (NativeClaudeAccount & { generation: string }) | undefined;
	let sessionId: string | undefined;
	let disposed = false;
	let pending = Promise.resolve();
	let queued = 0;
	const enqueue = (work: () => Promise<unknown>) => {
		if (queued >= 64) return;
		queued++;
		pending = pending
			.then(work)
			.then(
				() => {},
				() => {},
			)
			.finally(() => {
				queued--;
			});
	};
	return {
		async launched(account: NativeClaudeAccount | undefined): Promise<void> {
			if (
				disposed ||
				!isNativeClaudeAccount(account) ||
				!(await deps.validateAccount(account))
			)
				return;
			const generation = await deps.captureGeneration(
				account.selection,
				account.directory,
				account.identity,
			);
			if (!disposed && generation) launched = { ...account, generation };
		},
		session(id: string): void {
			if (disposed || !launched || sessionId) return;
			const receivedAt = now();
			sessionId = id;
			const account = launched;
			enqueue(async () => {
				const launch = { launchId, sessionId: id };
				const current = () =>
					!disposed && launched === account && sessionId === id;
				if (
					!current() ||
					!deps.store.captureLaunch({
						...launch,
						generation: account.generation,
					})
				)
					return;
				// A restored rate-limit event at counter zero is only a baseline.
				await ingestNativeClaudeBinding(
					account,
					launch,
					{
						source: "claude_sdk",
						receivedAt,
						responseCounter: 0,
						payload: {
							type: "rate_limit_event",
							uuid: "native-baseline",
							rate_limit_info: {},
						},
					},
					current,
					deps,
				);
			});
		},
		event(input: {
			sessionId: string;
			rateLimitInfo: unknown;
			eventId?: string;
			responseCounter: number;
		}): void {
			// Capture before the serial queue: proof work must not freshen this event.
			const receivedAt = now();
			if (disposed || !launched || input.sessionId !== sessionId) return;
			const account = launched;
			enqueue(async () => {
				await ingestNativeClaudeBinding(
					account,
					{ launchId, sessionId: input.sessionId },
					{
						source: "claude_sdk",
						receivedAt,
						responseCounter: input.responseCounter,
						payload: {
							type: "rate_limit_event",
							uuid: input.eventId ?? "native-rate-limit",
							session_id: input.sessionId,
							rate_limit_info: input.rateLimitInfo,
						},
					},
					() =>
						!disposed && launched === account && input.sessionId === sessionId,
					deps,
				);
			});
		},
		settled(): Promise<void> {
			return pending;
		},
		dispose(): void {
			disposed = true;
			launched = undefined;
			sessionId = undefined;
		},
	};
}
