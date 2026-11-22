import type { Item, UserMessage } from "@superset/chat/protocol";
import {
	isSamePullRequest,
	type PullRequestRef,
	pullRequestRefFromUrl,
} from "renderer/lib/github/pullRequestRef";

export function collectChatPullRequests(
	items: readonly Item[],
): PullRequestRef[] {
	const refs: PullRequestRef[] = [];
	for (const item of items) {
		const text =
			item.kind === "agent_message"
				? String(item.text ?? "")
				: item.kind === "user_message" && !item.discarded
					? (item as UserMessage).content
							.filter((part) => part.type === "text" && !part.hidden)
							.map((part) => part.text)
							.join("\n")
					: "";
		for (const match of text.matchAll(
			/https:\/\/(?:www\.)?github\.com\/[^\s/<>()[\]]+\/[^\s/<>()[\]]+\/pull\/\d+(?=[\s/?#<>()[\].,;:]|$)/g,
		)) {
			const ref = pullRequestRefFromUrl(match[0]);
			if (ref && !refs.some((existing) => isSamePullRequest(existing, ref)))
				refs.push(ref);
		}
	}
	return refs;
}
