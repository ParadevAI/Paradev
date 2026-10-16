import { z } from "zod";
import {
	type CardContext,
	type CardField,
	CardUnavailable,
	CHANGED_SINCE_CONFIRM,
	defineCard,
	type HandoffBugReportView,
	type SlackThreadView,
	withInput,
} from "../types";
import {
	doneRef,
	type Landed,
	landedOf,
	noRoom,
	planSentence,
	runSteps,
	type Step,
} from "./handoffSteps";
import { linearFor } from "./linearClient";
import {
	type DraftRefs,
	draftInput,
	draftRefs,
	fileDraft,
	type LoadedDraft,
	loadDraft,
} from "./linearDraft";
import { conversationInfo, slackReader } from "./slackCompose";
import { slackThread } from "./slackThread";
import {
	readerOnly,
	type replyInputSchema,
	replyParams,
	SLACK_ID,
	SLACK_TS,
	slack,
} from "./slackWorkspace";

interface Refs extends DraftRefs {
	channel: string;
	thread_ts: string;
	reply?: string;
	done?: string;
}

interface Data {
	draft: LoadedDraft;
	thread: SlackThreadView;
	channel: string;
	threadTs: string;
	replyUnavailable: string | null;
	landed: Landed;
	noRoom: string | null;
}

const REPLY_MAX = 2000;

const replySchema = z.object({
	text: z.string().trim().min(1).max(REPLY_MAX),
	blocks: z
		.array(
			z.looseObject({
				type: z.literal("rich_text"),
				elements: z.array(z.unknown()),
			}),
		)
		.max(1)
		.optional(),
});
type Reply = z.infer<typeof replySchema>;

const fileInput = z.object({
	issue: draftInput,
	reply: replySchema.nullable(),
	/** The thread the reader saw, from the view. */
	thread: z.object({ channel: z.string(), ts: z.string() }),
});
type FileInput = z.infer<typeof fileInput>;

/** The reply as the reader wrote it, with the issue's link on a line of its own after it. */
export function withLink(
	reply: Reply,
	url: string,
): z.infer<typeof replyInputSchema> {
	if (!url.startsWith("https://"))
		throw new CardUnavailable(
			"error",
			"The issue has no link to reply with. Look in Linear",
		);
	const [block] = reply.blocks ?? [];
	const linked =
		reply.text.includes(url) && (!block || JSON.stringify(block).includes(url));
	if (linked) return reply;
	const text = reply.text.includes(url) ? reply.text : `${reply.text}\n${url}`;
	if (!block) return { text, blocks: undefined };
	return {
		text,
		blocks: [
			{
				...block,
				elements: [
					...block.elements,
					{
						type: "rich_text_section",
						elements: [
							{ type: "text", text: "\n" },
							{ type: "link", url },
						],
					},
				],
			},
		],
	};
}

function steps(data: Data, ctx: CardContext, input: FileInput): Step[] {
	const { draft } = data;
	const where = data.thread.channel.name;
	const reply = input.reply;
	return [
		{
			id: "file",
			plan: `file "${input.issue.title}" in ${draft.team.name}`,
			run: async () => {
				const issue = await fileDraft(
					linearFor(ctx),
					ctx,
					draft,
					input.issue,
					`bug-report ${data.channel} ${data.threadTs}`,
				);
				return {
					text: `Filed ${issue.identifier} in ${draft.team.name}`,
					url: issue.url,
					detail: { issue },
				};
			},
		},
		...(reply
			? [
					{
						id: "reply",
						plan: `reply in ${where} with the link`,
						run: async (landed: Landed) => {
							const token = await readerOnly(ctx.organizationId, ctx.readerId);
							const posted = await slack(
								token,
								"chat.postMessage",
								z.object({ ts: z.string() }),
								{
									channel: data.channel,
									thread_ts: data.threadTs,
									...replyParams(withLink(reply, landed.file?.url ?? "")),
								},
								true,
							);
							return {
								text: `Replied in ${where}`,
								url: data.thread.permalink,
								detail: { ts: posted.ts },
							};
						},
					},
				]
			: []),
	];
}

async function replyBlocked(
	ctx: CardContext,
	thread: SlackThreadView,
	channel: string,
): Promise<string | null> {
	if (!thread.readerConnected)
		return "Connect your Slack account to reply as you";
	const member = await slackReader(ctx)
		.then((reader) => conversationInfo(reader, channel))
		.then(
			(info) => info.is_member !== false,
			() => false,
		);
	return member ? null : `You are not in ${thread.channel.name} in Slack`;
}

const TYPE = "handoff.bug_report";

export const handoffBugReport = defineCard<Refs, Data>({
	type: TYPE,
	label: "Bug report to Linear",
	ask: "File issue",
	brand: "linear",
	refs: z.object({
		channel: z.string().regex(SLACK_ID),
		thread_ts: z.string().regex(SLACK_TS),
		...draftRefs,
		/** The drafted answer to the thread; the issue's link is added after it. */
		reply: z.string().max(REPLY_MAX).optional(),
		done: doneRef,
	}),
	async resolve({ refs, ctx }) {
		const shown = await slackThread.resolve(
			{ channel: refs.channel, thread_ts: refs.thread_ts },
			ctx,
		);
		if (shown.state !== "ok" || shown.view?.kind !== "slack.thread")
			throw new CardUnavailable(
				shown.state === "ok" ? "error" : shown.state,
				shown.notice?.text ?? "Slack did not give this thread",
				shown.connect,
			);
		const thread = shown.view;
		const root = thread.messages[0];
		const [replyUnavailable, draft] = await Promise.all([
			replyBlocked(ctx, thread, refs.channel),
			loadDraft(linearFor(ctx), refs, {
				title: shown.title,
				description: [
					thread.readerConnected ? (root?.text ?? "") : "",
					thread.permalink
						? `Reported by ${root?.user.name ?? "someone"} in Slack: ${thread.permalink}`
						: "",
				]
					.filter(Boolean)
					.join("\n\n"),
			}),
		]);
		const landed = landedOf(ctx, TYPE, refs.done);
		const link = landed.file?.url;
		const answered =
			link &&
			thread.messages.some(
				(message) => message.user.isReader && message.text.includes(link),
			);
		if (answered && !landed.reply)
			landed.reply = {
				text: `Replied in ${thread.channel.name}`,
				url: thread.permalink,
			};
		const view: HandoffBugReportView = {
			kind: "handoff.bug_report",
			thread,
			issue: draft.view,
			reply: refs.reply ?? "",
			canReply: replyUnavailable === null,
			replyUnavailable,
			filed: landed.file ?? null,
			replied: landed.reply ?? null,
			plan: {
				file: `file "{title}" in ${draft.team.name}`,
				reply: `reply in ${thread.channel.name} with the link`,
			},
		};
		const fields: CardField[] = [
			{ label: "Reported in", value: thread.channel.name },
			{ label: "By", value: root?.user.name ?? "" },
			{ label: "File in", value: `${draft.team.name} (${draft.team.key})` },
			...(view.filed
				? [
						{
							label: "Filed",
							value: view.filed.text,
							...(view.filed.url ? { href: view.filed.url } : {}),
						},
					]
				: []),
		];
		return {
			title: draft.view.title,
			subtitle: `${thread.channel.name} to ${draft.team.name}`,
			status:
				view.filed && !view.replied
					? { tone: "warn", text: "Filed; the thread has no reply yet" }
					: undefined,
			fields,
			body: draft.view.description.slice(0, 500) || undefined,
			view,
			data: {
				draft,
				thread,
				channel: refs.channel,
				threadTs: refs.thread_ts,
				replyUnavailable,
				landed,
				noRoom: noRoom(refs, 2),
			},
		};
	},
	actions: {
		file: {
			label: (data) =>
				data.landed.file ? "Reply with the link" : "File issue",
			style: "primary",
			role: "primary",
			available: (data) => data.noRoom ?? true,
			confirmFor: (data, raw, ctx) => {
				const input = fileInput.safeParse(raw);
				return input.success
					? planSentence(steps(data, ctx, input.data), data.landed)
					: "";
			},
			run: withInput(fileInput, async ({ data, ctx, input }) => {
				if (
					input.thread.channel !== data.channel ||
					input.thread.ts !== data.threadTs ||
					input.issue.team !== data.draft.team.id
				)
					throw new CardUnavailable("error", CHANGED_SINCE_CONFIRM);
				if (input.reply && data.replyUnavailable)
					throw new CardUnavailable(
						"error",
						`${data.replyUnavailable}. File the issue without a reply`,
					);
				const { landed: _, ...ran } = await runSteps(
					ctx,
					TYPE,
					steps(data, ctx, input),
					data.landed,
				);
				return ran;
			}),
		},
		dismiss: {
			label: (data) => (data.landed.file ? "Done" : "Do not file"),
			style: "secondary",
			role: "dismiss",
			async run({ data }) {
				return { outcome: { landed: data.landed } };
			},
		},
	},
});
