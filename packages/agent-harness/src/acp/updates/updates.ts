export type AcpUpdate = { sessionUpdate: string } & Record<string, unknown>;
export type AcpStopReason = "end_turn" | "cancelled" | "error";

/** The few updates the worker writes itself; pdev writes the rest. */
export const acp = {
	running(): AcpUpdate {
		return { sessionUpdate: "state_update", state: "running" };
	},
	idle(stopReason: AcpStopReason, errorMessage?: string): AcpUpdate {
		return {
			sessionUpdate: "state_update",
			state: "idle",
			stopReason,
			...(stopReason === "error"
				? {
						error: { code: -32603, message: errorMessage ?? "The run failed." },
					}
				: {}),
		};
	},
	userMessage(messageId: string, text: string, clientId?: string): AcpUpdate {
		return {
			sessionUpdate: "user_message",
			messageId,
			content: [{ type: "text", text }],
			...(clientId ? { clientId } : {}),
		};
	},
	toolStopped(toolCallId: string): AcpUpdate {
		return {
			sessionUpdate: "tool_call_update",
			toolCallId,
			status: "failed",
			content: [
				{
					type: "content",
					content: { type: "text", text: "Stopped before it finished." },
				},
			],
		};
	},
};
