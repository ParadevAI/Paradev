interface ResumeInput {
	workspaceId: string;
	terminalId: string;
}
type ResumeResult =
	| { resumed: false }
	| { resumed: true; terminalId: string; label: string };
interface BackgroundRecovery {
	capabilities(): Promise<{ version: number; claudeLiveAttach: boolean }>;
	source(
		input: ResumeInput,
	): Promise<{ provider: string; revision: string } | null>;
	reconnect(input: ResumeInput & { expectedRevision: string }): Promise<
		| { reconnected: false }
		| { reconnected: true; terminalId: string; label: string }
		| {
				reconnected: false;
				attachmentPending: true;
				terminalId: string;
				label: string;
		  }
	>;
}
function missingProcedure(error: unknown): boolean {
	if (!error || typeof error !== "object" || !("data" in error)) return false;
	const data = error.data;
	return (
		!!data &&
		typeof data === "object" &&
		"code" in data &&
		data.code === "NOT_FOUND"
	);
}
/** Network/verification failures never fall through to a second worker launch. */
export async function resumeWithBackgroundReconnect(
	input: ResumeInput,
	provider: string,
	recovery: BackgroundRecovery,
	resume: (input: ResumeInput) => Promise<ResumeResult>,
): Promise<ResumeResult> {
	if (provider !== "claude") return resume(input);
	let capability: Awaited<ReturnType<BackgroundRecovery["capabilities"]>>;
	try {
		capability = await recovery.capabilities();
	} catch (error) {
		if (missingProcedure(error)) return resume(input);
		throw error;
	}
	if (capability.version !== 1 || !capability.claudeLiveAttach)
		return resume(input);
	const source = await recovery.source(input);
	if (!source || source.provider !== "claude") return resume(input);
	const result = await recovery.reconnect({
		...input,
		expectedRevision: source.revision,
	});
	if (result.reconnected || "attachmentPending" in result)
		return {
			resumed: true,
			terminalId: result.terminalId,
			label: result.label,
		};
	return resume(input);
}
