import { z } from "zod";
import {
	type CardField,
	CardUnavailable,
	defineCard,
	type LinearCommentView,
	type LinearReactionView,
	type LinearThreadView,
	withInput,
} from "../types";
import { type LinearQuery, linearFor } from "./linearClient";
import {
	COMMENT_MAX,
	DRAFT_MAX,
	ISSUE_REF,
	LINEAR_ID,
	loadIssue,
	loadPeople,
	postComment,
	type RawIssue,
	toIssueView,
	toPerson,
} from "./linearIssues";

interface Refs {
	issue: string;
	comment?: string;
	reply?: string;
}

interface RawComment {
	id: string;
	body: string;
	createdAt: string;
	editedAt: string | null;
	parent: { id: string } | null;
	user: Parameters<typeof toPerson>[0] | null;
	botActor: { name: string | null; avatarUrl: string | null } | null;
	reactions: {
		id: string;
		emoji: string;
		user: { id: string; name: string } | null;
	}[];
}

interface Data {
	issue: RawIssue;
	root: RawComment;
	replies: RawComment[];
	viewerId: string;
}

const EMOJI = /^[^\s:]{1,64}$/;

const COMMENT = `id body createdAt editedAt parent { id }
	user { id name displayName avatarUrl app }
	botActor { name avatarUrl }
	reactions { id emoji user { id name } }`;

const NO_COMMENT = "That comment is no longer on the issue";
const NO_COMMENTS = "This issue has no comments yet";
const THREAD_CHANGED =
	"The thread changed in Linear. Look again before you reply";

/** The root of the thread a comment is in, or of the issue's newest thread. */
async function rootOf(
	gql: LinearQuery,
	issueId: string,
	commentRef: string | undefined,
): Promise<string> {
	if (!commentRef) {
		const { issue } = await gql<{
			issue: { comments: { nodes: { id: string }[] } };
		}>(
			"query($id: String!) { issue(id: $id) { comments(first: 1, filter: { parent: { null: true } }, orderBy: createdAt) { nodes { id } } } }",
			{ id: issueId },
		);
		const newest = issue.comments.nodes[0];
		if (!newest) throw new CardUnavailable("gone", NO_COMMENTS);
		return newest.id;
	}
	const { comment } = await gql<{
		comment: {
			id: string;
			parent: { id: string } | null;
			issue: { id: string } | null;
		} | null;
	}>(
		"query($id: String!) { comment(id: $id) { id parent { id } issue { id } } }",
		{ id: commentRef },
	).catch((error) => {
		if (error instanceof CardUnavailable && error.state === "gone")
			return { comment: null };
		throw error;
	});
	if (!comment || comment.issue?.id !== issueId)
		throw new CardUnavailable("gone", NO_COMMENT);
	return comment.parent?.id ?? comment.id;
}

async function loadThread(
	gql: LinearQuery,
	rootId: string,
): Promise<{ root: RawComment; replies: RawComment[] }> {
	const { comment } = await gql<{
		comment: RawComment & { children: { nodes: RawComment[] } };
	}>(
		`query($id: String!) { comment(id: $id) { ${COMMENT} children(first: 250) { nodes { ${COMMENT} } } } }`,
		{ id: rootId },
	);
	const { children, ...root } = comment;
	return {
		root,
		replies: [...children.nodes].sort(
			(a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt),
		),
	};
}

/** Linear's chips: one per emoji in the order first used, with the reader's own to take back. */
export function toReactions(
	reactions: RawComment["reactions"],
	viewerId: string,
): LinearReactionView[] {
	const byEmoji = new Map<string, LinearReactionView>();
	for (const reaction of reactions) {
		const chip = byEmoji.get(reaction.emoji) ?? {
			emoji: reaction.emoji,
			count: 0,
			mine: null,
			names: [],
		};
		chip.count += 1;
		if (reaction.user?.id === viewerId) chip.mine = reaction.id;
		if (reaction.user) chip.names.push(reaction.user.name);
		byEmoji.set(reaction.emoji, chip);
	}
	return [...byEmoji.values()];
}

function toComment(comment: RawComment, viewerId: string): LinearCommentView {
	return {
		id: comment.id,
		body: comment.body,
		author: comment.user
			? toPerson(comment.user)
			: comment.botActor?.name
				? {
						id: "",
						name: comment.botActor.name,
						handle: "",
						avatar: comment.botActor.avatarUrl,
						app: true,
					}
				: null,
		createdAt: comment.createdAt,
		edited: comment.editedAt !== null,
		reactions: toReactions(comment.reactions, viewerId),
	};
}

export const linearThread = defineCard<Refs, Data>({
	type: "linear.thread",
	label: "Linear comment thread",
	ask: "Reply",
	brand: "linear",
	refs: z.object({
		issue: z.string().regex(ISSUE_REF),
		/** Any comment of the thread; without one, the issue's newest thread. */
		comment: z.string().regex(LINEAR_ID).optional(),
		reply: z.string().max(DRAFT_MAX).optional(),
	}),
	async resolve({ refs, ctx }) {
		const gql = linearFor(ctx);
		const issue = await loadIssue(gql, refs.issue);
		const [people, { root, replies }] = await Promise.all([
			loadPeople(gql, issue.team.id),
			rootOf(gql, issue.id, refs.comment).then((id) => loadThread(gql, id)),
		]);
		const viewerId = people.account.viewer.id;
		const view: LinearThreadView = {
			kind: "linear.thread",
			account: people.account,
			issue: toIssueView(issue, true),
			mentionable: people.mentionable,
			root: toComment(root, viewerId),
			replies: replies.map((reply) => toComment(reply, viewerId)),
			draft: refs.reply ?? "",
			version: (replies.at(-1) ?? root).id,
		};
		const last = replies.at(-1) ?? root;
		const fields: CardField[] = [
			{ label: "Issue", value: issue.identifier, href: issue.url },
			{ label: "Comments", value: String(replies.length + 1) },
		];
		return {
			title: issue.title,
			subtitle: issue.identifier,
			fields,
			body: last.body.slice(0, 1200) || undefined,
			view,
			data: { issue, root, replies, viewerId },
		};
	},
	actions: {
		reply: {
			label: () => "Reply",
			style: "primary",
			role: "primary",
			run: withInput(
				z.object({
					body: z.string().trim().min(1).max(COMMENT_MAX),
					/** `root.id` and `version` from the view the reader replied from. */
					root: z.string().regex(LINEAR_ID),
					seen: z.string().regex(LINEAR_ID),
				}),
				async ({ data, ctx, input }) => {
					const newest = (data.replies.at(-1) ?? data.root).id;
					if (input.root !== data.root.id || input.seen !== newest)
						throw new CardUnavailable("error", THREAD_CHANGED);
					const made = await postComment(linearFor(ctx), ctx, {
						issueId: data.issue.id,
						parentId: data.root.id,
						body: input.body,
					});
					return {
						outcome: { replied: true, comment: made },
						notice: { tone: "good", text: "Reply posted" },
					};
				},
			),
		},
		react: {
			label: () => "React",
			style: "secondary",
			role: "other",
			terminal: false,
			run: withInput(
				z.object({
					comment: z.string().regex(LINEAR_ID),
					emoji: z.string().regex(EMOJI),
					/** True to add the reader's reaction, false to take it back. */
					on: z.boolean(),
				}),
				async ({ data, ctx, input }) => {
					const gql = linearFor(ctx);
					const target = [data.root, ...data.replies].find(
						(comment) => comment.id === input.comment,
					);
					if (!target)
						throw new CardUnavailable(
							"error",
							"That comment is not in this thread",
						);
					const mine = target.reactions.find(
						(reaction) =>
							reaction.emoji === input.emoji &&
							reaction.user?.id === data.viewerId,
					);
					if (mine && !input.on) {
						await gql(
							"mutation($id: String!) { reactionDelete(id: $id) { success } }",
							{ id: mine.id },
						);
					} else if (!mine && input.on) {
						await gql(
							"mutation($input: ReactionCreateInput!) { reactionCreate(input: $input) { success } }",
							{ input: { commentId: target.id, emoji: input.emoji } },
						);
					}
					return { outcome: { reacted: input.on, emoji: input.emoji } };
				},
			),
		},
	},
});
