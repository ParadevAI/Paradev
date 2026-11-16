import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";

/** Posts a message in the chat as the Dev's running turn. */
export type PostUpdate = (text: string, replyTo?: string) => Promise<void>;

/** The `replyTo` parameter of `reply` and `send_update`. */
export const REPLY_TO =
	"The message you're answering, to quote it over yours: its id as your input names it (#1a2b3c4d). Use it in a busy group, when it isn't clear which message you answer";

/** The body both tools post: the text, and the message it quotes when there is one. */
export const withReplyTo = (text: string, replyTo: string | undefined) =>
	replyTo ? { text, replyTo } : { text };

const UpdateParams = Type.Object({
	text: Type.String({
		description:
			"The message, in markdown. @Name mentions someone when one person or Dev here has that name",
	}),
	replyTo: Type.Optional(Type.String({ description: REPLY_TO })),
});

/**
 * `POST <api>/cli/messages`, naming the chat (the box's proxy adds its credential): the API posts it as the Dev's
 * message in its running turn there, at once.
 */
export function updatesOverHttp(apiUrl: string, chatId: string): PostUpdate {
	const url = `${apiUrl.replace(/\/+$/, "")}/cli/messages`;
	return async (text, replyTo) => {
		const res = await fetch(url, {
			method: "POST",
			headers: { "x-dev-chat": chatId, "content-type": "application/json" },
			body: JSON.stringify(withReplyTo(text, replyTo)),
		});
		if (!res.ok) {
			const error = (await res.json().catch(() => ({}))) as {
				message?: string;
			};
			throw new Error(error.message ?? `The API answered ${res.status}`);
		}
	};
}

const POSTED =
	"Posted: people in the chat can see it now. Don't repeat it in your reply; reply with only what's new since, or not at all.";

/**
 * The `send_update` tool: posts a message in the chat at once, mid-turn, for what people should see before the
 * Dev's reply (the `reply` tool) or, in a task or a trigger's turn, the only way it speaks in the chat. The Dev's
 * own tool only: subagents can't post.
 */
export function updateExtension(post: PostUpdate) {
	return (pi: ExtensionAPI) => {
		pi.registerTool({
			name: "send_update",
			label: "Update",
			description:
				'Post a message in this chat now, while you keep working: an "on it" before long work, progress worth knowing, something people should see before you carry on. Keep it to a line or two. Not for your answer: that\'s the reply tool.',
			promptSnippet:
				"Post an interim update in the chat while you keep working",
			parameters: UpdateParams,
			executionMode: "sequential",
			async execute(_toolCallId, params) {
				const text = params.text.trim();
				if (!text) throw new Error("The update is empty");
				await post(text, params.replyTo?.trim() || undefined);
				// The model reads this right after posting: the moment it might otherwise repeat the update in its reply.
				return {
					content: [{ type: "text" as const, text: POSTED }],
					details: undefined,
				};
			},
		});
	};
}
