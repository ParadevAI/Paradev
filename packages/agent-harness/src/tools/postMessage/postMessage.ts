import type { AgentTool } from "@earendil-works/pi-agent-core";
import { Type } from "@earendil-works/pi-ai";

/** Posts into the room people read; the API checks the Dev may post there. */
export interface RoomPoster {
	post(input: {
		body: string;
		threadRootId?: string;
		/** The same key for a retried call, so a retry never posts twice. */
		idempotencyKey: string;
	}): Promise<{ messageId: string }>;
}

export const POST_MESSAGE_TOOL = "post_message";

const postMessageParameters = Type.Object({
	body: Type.String({
		description:
			"The message, in Markdown. Keep each post short; post again for the next update.",
	}),
	thread_root_id: Type.Optional(
		Type.String({
			description: "Reply in this message's thread instead of the room.",
		}),
	),
});

export function createPostMessageTool(
	poster: RoomPoster,
): AgentTool<typeof postMessageParameters> {
	return {
		name: POST_MESSAGE_TOOL,
		label: POST_MESSAGE_TOOL,
		description:
			"Post a message to the person you are talking with. People read only what you post here, not your other output, so post your answer, and post short updates during long work.",
		parameters: postMessageParameters,
		async execute(toolCallId, params) {
			const { messageId } = await poster.post({
				body: params.body,
				...(params.thread_root_id
					? { threadRootId: params.thread_root_id }
					: {}),
				idempotencyKey: toolCallId,
			});
			return {
				content: [{ type: "text", text: "Posted." }],
				details: { messageId },
			};
		},
	};
}
