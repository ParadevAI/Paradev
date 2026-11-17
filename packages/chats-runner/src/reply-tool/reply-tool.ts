import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import { REPLY_TO, withReplyTo } from "../update-tool/update-tool.ts";

/** Posts the Dev's reply in the chat for its running turn. */
export type PostReply = (text: string, replyTo?: string) => Promise<void>;

const ReplyParams = Type.Object({
	text: Type.String({
		description:
			"The message itself, in markdown. @Name mentions someone when one person or Dev here has that name",
	}),
	replyTo: Type.Optional(Type.String({ description: REPLY_TO })),
});

/**
 * `POST <api>/cli/reply`, naming the chat (the box's proxy adds its credential): the API posts it as the Dev's
 * message, its reply in the running turn, and refuses it for a turn whose words go elsewhere (a task, an ask).
 */
export function repliesOverHttp(apiUrl: string, chatId: string): PostReply {
	const url = `${apiUrl.replace(/\/+$/, "")}/cli/reply`;
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
	"Posted: that's your reply, and people in the chat can see it now. You're done: end the turn without more text (it isn't shown to anyone).";

/**
 * The `reply` tool: the only way a Dev says something in the chat as its answer to a message. Its final text isn't
 * posted, so not calling it is staying quiet. The Dev's own tool, in its chat sessions only: subagents can't post,
 * and a trigger's session reports with `report_events`.
 */
export function replyExtension(post: PostReply) {
	return (pi: ExtensionAPI) => {
		pi.registerTool({
			name: "reply",
			label: "Reply",
			description:
				"Post your reply in this chat: the message itself, as people will read it. Keep it short: a sentence or two, about 60 words unless someone asked for detail. Call it once, at the end, with an answer for each request you handled and what you changed or now remember. Don't call it when the message wasn't for you or needs nothing from you: then you stay quiet.",
			promptSnippet:
				"Post your reply in the chat (not calling it is staying quiet)",
			parameters: ReplyParams,
			executionMode: "sequential",
			async execute(_toolCallId, params) {
				const text = params.text.trim();
				if (!text)
					throw new Error(
						"The reply is empty: to stay quiet, don't call reply",
					);
				await post(text, params.replyTo?.trim() || undefined);
				return {
					content: [{ type: "text" as const, text: POSTED }],
					details: undefined,
				};
			},
		});
	};
}
