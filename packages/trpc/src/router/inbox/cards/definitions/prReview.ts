import { BUILTIN_AGENT_IDS } from "@superset/shared/agent-catalog";
import { z } from "zod";
import {
	type CardField,
	CardUnavailable,
	defineCard,
	type PrReviewView,
	type ReviewThreadView,
	withInput,
} from "../types";
import { loadWorkspace, type WorkspaceRecord } from "./supersetWorkspace";
import { callWorkspaceHost, sendToWorkspaceAgent } from "./workspaceHost";

const NOTE_MAX = 4000;
const PROMPT_MAX = 30_000;

/** What host-service's `git.getPullRequestThreads` answers with. */
interface HostThreads {
	reviewThreads: {
		id: string;
		isResolved: boolean;
		isOutdated: boolean;
		line: number | null;
		path: string;
		comments: {
			id: string;
			databaseId: number;
			author: { login: string; avatarUrl: string };
			body: string;
			createdAt: string;
		}[];
	}[];
}

function openThreads(host: HostThreads, prUrl: string): ReviewThreadView[] {
	return host.reviewThreads
		.filter((thread) => !thread.isResolved)
		.map((thread) => ({
			id: thread.id,
			path: thread.path,
			line: thread.line,
			outdated: thread.isOutdated,
			comments: thread.comments.map((comment) => ({
				id: String(comment.databaseId),
				author: {
					login: comment.author.login,
					avatarUrl: comment.author.avatarUrl || null,
				},
				body: comment.body,
				createdAt: comment.createdAt,
				url: `${prUrl}#discussion_r${comment.databaseId}`,
			})),
		}));
}

/** What the agent is asked to do, in plain text it can act on. */
export function addressPrompt(
	view: Pick<PrReviewView, "pullRequest" | "threads">,
	note: string,
): string {
	const pr = view.pullRequest;
	const lines = [
		`Address the open review threads on ${pr.repo}#${pr.number} "${pr.title}" (${pr.url}).`,
		"",
	];
	for (const thread of view.threads) {
		lines.push(
			`- ${thread.path}${thread.line ? `:${thread.line}` : ""}${thread.outdated ? " (outdated)" : ""}`,
		);
		for (const comment of thread.comments) {
			lines.push(
				`  ${comment.author.login}: ${comment.body.trim().replace(/\n/g, "\n  ")}`,
			);
		}
	}
	if (note) lines.push("", `Note from the person who sent this: ${note}`);
	lines.push(
		"",
		"Fix what each thread asks, push to the same branch, and reply on each thread with what changed.",
	);
	return lines.join("\n").slice(0, PROMPT_MAX);
}

interface Data {
	record: WorkspaceRecord;
	agent: string;
	view: PrReviewView;
}

const replySchema = z.object({
	thread: z.string().min(1).max(200),
	body: z.string().trim().min(1).max(NOTE_MAX),
});
const resolveSchema = z.object({
	thread: z.string().min(1).max(200),
	resolved: z.boolean().default(true),
});

function openThread(data: Data, id: string) {
	const thread = data.view.threads.find((t) => t.id === id);
	if (!thread)
		throw new CardUnavailable("gone", "That thread is no longer open");
	return thread;
}

/**
 * Review comments landed on the PR a workspace is working on. The threads come
 * from the workspace's own host, the same call its review tab makes, so
 * replies and resolves go out with that machine's GitHub account; "Address
 * with agent" hands every open thread to a new agent session there.
 */
export const prReview = defineCard<
	{ workspace: string; host?: string; agent?: string },
	Data
>({
	type: "superset.pr_review",
	label: "Review comments",
	ask: "Address review",
	brand: "superset",
	systemOnly: true,
	refs: z.object({
		workspace: z.string().uuid(),
		/** The machine a local workspace lives on; cloud workspaces need none. */
		host: z
			.string()
			.regex(/^[a-zA-Z0-9_-]{1,128}$/)
			.optional(),
		agent: z.enum(BUILTIN_AGENT_IDS).optional(),
	}),
	async resolve({ refs, ctx }) {
		const { record, view: workspace } = await loadWorkspace(
			ctx.organizationId,
			ctx.readerId,
			refs.workspace,
			refs.host ?? ctx.card?.hostId ?? undefined,
		);
		const pr = workspace.pullRequest;
		if (!pr)
			throw new CardUnavailable("gone", "That workspace has no pull request");
		const host = await callWorkspaceHost<{ workspaceId: string }, HostThreads>({
			record,
			userId: ctx.readerId,
			procedure: "git.getPullRequestThreads",
			input: { workspaceId: record.row.id },
			query: true,
		});
		const view: PrReviewView = {
			kind: "superset.pr_review",
			workspace,
			pullRequest: pr,
			threads: openThreads(host, pr.url),
		};
		const fields: CardField[] = [
			{ label: "Pull request", value: `${pr.repo}#${pr.number}` },
			{ label: "Open threads", value: String(view.threads.length) },
		];
		return {
			title: "Review comments",
			subtitle: `${pr.repo}#${pr.number}`,
			fields,
			view,
			data: { record, agent: refs.agent ?? "claude", view },
		};
	},
	actions: {
		reply: {
			label: () => "Reply",
			style: "secondary",
			role: "other",
			terminal: false,
			run: withInput(replySchema, async ({ data, ctx, input }) => {
				const thread = openThread(data, input.thread);
				const root = thread.comments[0];
				if (!root)
					throw new CardUnavailable("gone", "That thread is no longer open");
				await callWorkspaceHost({
					record: data.record,
					userId: ctx.readerId,
					procedure: "git.replyToReviewThread",
					input: {
						workspaceId: data.record.row.id,
						commentId: Number(root.id),
						body: input.body,
					},
				});
				return { outcome: { replied: thread.id } };
			}),
		},
		resolve: {
			label: () => "Resolve",
			style: "secondary",
			role: "other",
			terminal: false,
			run: withInput(resolveSchema, async ({ data, ctx, input }) => {
				const thread = openThread(data, input.thread);
				await callWorkspaceHost({
					record: data.record,
					userId: ctx.readerId,
					procedure: "git.setReviewThreadResolution",
					input: {
						workspaceId: data.record.row.id,
						threadId: thread.id,
						resolved: input.resolved,
					},
				});
				return { outcome: { resolved: thread.id } };
			}),
		},
		address: {
			label: () => "Address with agent",
			style: "primary",
			role: "primary",
			input: "Anything the agent should know",
			available: (data) =>
				data.view.threads.length > 0 || "No review thread is open",
			async run({ data, ctx, input }) {
				const note = input?.trim() ?? "";
				if (note.length > NOTE_MAX)
					throw new CardUnavailable("error", "That note is too long");
				const run = await sendToWorkspaceAgent({
					record: data.record,
					userId: ctx.readerId,
					agent: data.agent,
					prompt: addressPrompt(data.view, note),
				});
				return {
					outcome: {
						addressed: true,
						threads: data.view.threads.length,
						terminalId: run.sessionId,
					},
					notice: { tone: "good", text: "Sent to an agent in the workspace" },
				};
			},
		},
	},
});
