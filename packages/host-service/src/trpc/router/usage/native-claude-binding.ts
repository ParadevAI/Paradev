import type { createNativeClaudeUsageStore } from "./native-claude-usage";

export interface NativeClaudeAccount {
	agent: "claude" | "codex";
	credentialKind: "subscription" | "api_key";
	selection: string | null;
	identity: string;
	directory?: string;
	pinned?: true;
	conflict?: true;
}
export interface NativeClaudeLaunch {
	launchId: string;
	sessionId: string;
}
export interface NativeClaudeUsageDependencies {
	captureGeneration(
		selection: string | null,
		directory: string,
		identity: string,
	): Promise<string | null>;
	resolveScope(
		selection: string | null,
		directory: string,
		identity: string,
		generation: string,
	): Promise<string | null>;
	validateAccount(account: NativeClaudeAccount): Promise<boolean>;
	store: ReturnType<typeof createNativeClaudeUsageStore>;
}
export function isNativeClaudeAccount(
	account: NativeClaudeAccount | undefined,
): account is NativeClaudeAccount & { directory: string } {
	return (
		!!account &&
		account.agent === "claude" &&
		account.credentialKind === "subscription" &&
		account.pinned === true &&
		!account.conflict &&
		!!account.directory
	);
}
export async function ingestNativeClaudeBinding(
	account: NativeClaudeAccount,
	launch: NativeClaudeLaunch,
	input: {
		source: "claude_statusline" | "claude_sdk";
		payload: unknown;
		receivedAt: number;
		responseCounter?: number;
	},
	current: () => boolean,
	deps: NativeClaudeUsageDependencies,
): Promise<boolean> {
	if (
		!deps.store.isCurrentReceipt(input.receivedAt) ||
		!isNativeClaudeAccount(account) ||
		!current() ||
		!(await deps.validateAccount(account))
	)
		return false;
	const generation = await deps.captureGeneration(
		account.selection,
		account.directory,
		account.identity,
	);
	if (!generation || !current()) return false;
	let bound = deps.store.activeScope({ ...launch, generation });
	if (!bound) return false;
	const scope = await deps.resolveScope(
		account.selection,
		account.directory,
		account.identity,
		generation,
	);
	if (!current() || !deps.store.isCurrentReceipt(input.receivedAt))
		return false;
	if (scope) {
		if (!deps.store.promoteLaunch({ ...launch, generation, scope }))
			return false;
		bound = deps.store.activeScope({ ...launch, generation });
		if (!bound || bound.pending || bound.scope !== scope) return false;
	} else if (!bound.pending) {
		// Previously verified authority has expired or was invalidated; retain its original age.
		return false;
	}
	deps.store.ingest({
		...launch,
		...input,
		scope: bound.scope,
		quarantined: bound.pending,
	});
	return !bound.pending;
}
