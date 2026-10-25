interface Input {
	workspaceId: string;
	terminalId: string;
	expectedRevision: string;
}
interface Successor {
	terminalId: string;
	label: string;
}
interface Account {
	selection: string | null;
	identity: string;
}
interface ContinueNativeIO {
	reconnect(
		input: Input,
	): Promise<
		| { reconnected: false }
		| ({ reconnected: true } & Successor)
		| ({ reconnected: false; attachmentPending: true } & Successor)
	>;
	source(input: { workspaceId: string; terminalId: string }): Promise<{
		provider: string;
		ready: boolean;
		revision: string;
		account: Account | null;
	} | null>;
	resume(
		input: Input & { account: Account },
	): Promise<{ resumed: false } | ({ resumed: true } & Successor)>;
}
export async function continueNativeBackground(
	input: Input,
	io: ContinueNativeIO,
): Promise<Successor | null> {
	const live = await io.reconnect(input);
	if (live.reconnected || "attachmentPending" in live)
		return { terminalId: live.terminalId, label: live.label };
	const saved = await io.source(input);
	if (
		!saved?.ready ||
		saved.provider !== "claude" ||
		saved.revision !== input.expectedRevision ||
		!saved.account
	)
		return null;
	const result = await io.resume({
		...input,
		account: {
			selection: saved.account.selection,
			identity: saved.account.identity,
		},
	});
	return result.resumed
		? { terminalId: result.terminalId, label: result.label }
		: null;
}
