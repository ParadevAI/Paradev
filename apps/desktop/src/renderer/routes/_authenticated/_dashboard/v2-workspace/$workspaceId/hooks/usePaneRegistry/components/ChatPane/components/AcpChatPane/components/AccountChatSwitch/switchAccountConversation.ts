import type { ChatTransport } from "@superset/chat/client";
import type { SwitchAccountSessionInput } from "@superset/chat/protocol";

/** A lost mutation reply must not duplicate the switch or fall back to a default login. */
export async function switchAccountConversation(
	transport: Pick<
		ChatTransport,
		"switchAccountSession" | "accountSessionByCommand" | "getSession"
	>,
	input: SwitchAccountSessionInput,
) {
	try {
		return await transport.switchAccountSession(input);
	} catch (error) {
		const receipt = await transport
			.accountSessionByCommand({ commandId: input.commandId })
			.catch(() => null);
		if (receipt) {
			const saved = await transport
				.getSession({ sessionId: receipt.sessionId })
				.catch(() => null);
			if (
				saved?.session?.predecessorSessionId === input.sessionId &&
				saved.account?.selection === input.account.selection &&
				saved.account.identity === input.account.identity
			)
				return receipt;
		}
		throw error;
	}
}
