import type { TerminalAgentBinding } from "../../../terminal-agents/types";
import {
	captureNativeClaudeUsageGeneration,
	resolveNativeClaudeUsageScope,
} from "../usage/claude";
import {
	ingestNativeClaudeBinding,
	isNativeClaudeAccount,
	type NativeClaudeAccount,
	type NativeClaudeUsageDependencies,
} from "../usage/native-claude-binding";
import { nativeClaudeUsage } from "../usage/native-claude-usage";
import {
	sameSessionAccountContext,
	validateSessionAccount,
} from "../usage/session-account/session-account";

export interface NativeClaudeHookIdentity {
	terminalId: string;
	launchId: string;
	sessionId: string;
}
const dependencies: NativeClaudeUsageDependencies = {
	captureGeneration: captureNativeClaudeUsageGeneration,
	resolveScope: resolveNativeClaudeUsageScope,
	validateAccount: validateSessionAccount,
	store: nativeClaudeUsage,
};
export function matchesNativeClaudeHook(
	binding: TerminalAgentBinding | undefined,
	input: NativeClaudeHookIdentity,
): binding is TerminalAgentBinding {
	return (
		!!binding &&
		binding.endedAt === undefined &&
		!binding.accountInvalid &&
		binding.agentId === "claude" &&
		binding.terminalId === input.terminalId &&
		binding.launchId === input.launchId &&
		binding.agentSessionId === input.sessionId &&
		binding.account?.pinned === true &&
		!binding.account.conflict &&
		binding.account.agent === "claude" &&
		binding.account.credentialKind === "subscription"
	);
}
export function createNativeClaudeTerminalFeed(
	deps = dependencies,
	now = Date.now,
) {
	const permits = new Map<
		string,
		{ account: NativeClaudeAccount; generation: string; at: number }
	>();
	return {
		async prepare(
			terminalId: string,
			account: NativeClaudeAccount | undefined,
		): Promise<boolean> {
			if (
				!isNativeClaudeAccount(account) ||
				!(await deps.validateAccount(account))
			)
				return false;
			const generation = await deps.captureGeneration(
				account.selection,
				account.directory,
				account.identity,
			);
			if (!generation) return false;
			const at = now();
			for (const [id, value] of permits)
				if (at - value.at > 300_000 || value.at > at) permits.delete(id);
			while (permits.size >= 256)
				permits.delete(permits.keys().next().value as string);
			permits.set(terminalId, { account: { ...account }, generation, at });
			return true;
		},
		capture(
			identity: NativeClaudeHookIdentity,
			current: () => TerminalAgentBinding | undefined,
		): boolean {
			const binding = current();
			const permit = permits.get(identity.terminalId);
			if (
				!permit ||
				now() < permit.at ||
				now() - permit.at > 300_000 ||
				!matchesNativeClaudeHook(binding, identity) ||
				!sameSessionAccountContext(binding.account, permit.account)
			)
				return false;
			const captured = deps.store.captureLaunch({
				...identity,
				generation: permit.generation,
			});
			if (captured) permits.delete(identity.terminalId);
			return captured;
		},
		async ingest(
			identity: NativeClaudeHookIdentity,
			payload: unknown,
			current: () => TerminalAgentBinding | undefined,
		): Promise<boolean> {
			const binding = current();
			if (!matchesNativeClaudeHook(binding, identity) || !binding.account)
				return false;
			const account = binding.account;
			const unchanged = () => {
				const after = current();
				return (
					matchesNativeClaudeHook(after, identity) &&
					sameSessionAccountContext(after.account, account)
				);
			};
			return ingestNativeClaudeBinding(
				account,
				identity,
				{ source: "claude_statusline", payload },
				unchanged,
				deps,
			);
		},
	};
}
const feed = createNativeClaudeTerminalFeed();
export const prepareNativeClaudeTerminalLaunch = feed.prepare;
export const captureNativeClaudeLaunch = feed.capture;
export const ingestNativeClaudeHook = feed.ingest;
