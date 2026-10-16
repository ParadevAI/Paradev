import { z } from "zod";
import {
	type CardField,
	CardUnavailable,
	CHANGED_SINCE_CONFIRM,
	defineCard,
	type SlackRequestView,
	withInput,
} from "../types";
import {
	conversationInfo,
	DRAFT_MAX,
	membersOf,
	type RawConversation,
	type Reader,
	SLACK_CHANNEL,
	SLACK_USER,
	slackReader,
	toConversation,
	workspaceOf,
} from "./slackCompose";
import { messageSchema, toMessageView } from "./slackMessages";
import {
	isSlack,
	replyInputSchema,
	replyParams,
	SLACK_TS,
	slack,
} from "./slackWorkspace";

interface Refs {
	channel: string;
	ts: string;
	grant_channel?: string;
	grant_user?: string;
	approve_reply?: string;
	deny_reply?: string;
}

interface Data {
	reader: Reader;
	channel: RawConversation;
	thread: string;
	requester: string;
	grant: {
		user: string;
		name: string;
		channel: RawConversation;
		alreadyMember: boolean;
	} | null;
	ownControls: boolean;
}

const OWN_CONTROLS =
	"Only Slack can press this request's own buttons. Open it in Slack";

type Raw = Record<string, unknown>;

function nodes(value: unknown): Raw[] {
	if (Array.isArray(value)) return value.flatMap(nodes);
	if (!value || typeof value !== "object") return [];
	const node = value as Raw;
	return [node, ...nodes(node.elements), ...nodes(node.accessory)];
}

const INTERACTIVE =
	/select|overflow|datepicker|timepicker|checkboxes|radio_buttons|workflow_button/;

/** A link button only opens a page; every other control belongs to the app or workflow that sent the message, and no other app can press it. */
function hasOwnControls(message: Raw): boolean {
	const legacy = nodes(message.attachments).some(
		(attachment) =>
			Array.isArray(attachment.actions) && attachment.actions.length,
	);
	return (
		legacy ||
		nodes([
			message.blocks,
			...nodes(message.attachments).map((a) => a.blocks),
		]).some(
			(element) =>
				typeof element.type === "string" &&
				((element.type === "button" && !element.url) ||
					INTERACTIVE.test(element.type)),
		)
	);
}

const answerable = (data: Data): true | string =>
	data.ownControls && !data.grant
		? OWN_CONTROLS
		: data.channel.is_archived
			? "That channel is archived"
			: true;

async function reply(
	data: Data,
	input: z.infer<typeof replyInputSchema> | null | undefined,
): Promise<string | null> {
	if (!input) return null;
	const posted = await slack(
		data.reader.token,
		"chat.postMessage",
		z.object({ ts: z.string() }),
		{ channel: data.channel.id, thread_ts: data.thread, ...replyParams(input) },
		true,
	);
	return posted.ts;
}

async function read(reader: Reader, channel: string, ts: string): Promise<Raw> {
	const page = z.object({
		messages: z.array(z.record(z.string(), z.unknown())),
	});
	const top = await slack(reader.token, "conversations.history", page, {
		channel,
		latest: ts,
		inclusive: "true",
		limit: "1",
	});
	const found =
		top.messages.find((each) => each.ts === ts) ??
		(
			await slack(reader.token, "conversations.replies", page, {
				channel,
				ts,
				limit: "1",
			}).catch((error) => {
				if (isSlack(error, "thread_not_found"))
					return { messages: [] as Raw[] };
				throw error;
			})
		).messages.find((each) => each.ts === ts);
	if (!found)
		throw new CardUnavailable("gone", "That request is no longer in Slack");
	return found;
}

export const slackRequest = defineCard<Refs, Data>({
	type: "slack.request",
	label: "Slack request",
	ask: "Answer request",
	brand: "slack",
	refs: z
		.object({
			channel: z.string().regex(SLACK_CHANNEL),
			ts: z.string().regex(SLACK_TS),
			/** The channel and the person an approval adds to it. */
			grant_channel: z.string().regex(SLACK_CHANNEL).optional(),
			grant_user: z.string().regex(SLACK_USER).optional(),
			approve_reply: z.string().max(DRAFT_MAX).optional(),
			deny_reply: z.string().max(DRAFT_MAX).optional(),
		})
		.refine((refs) => Boolean(refs.grant_channel) === Boolean(refs.grant_user)),
	async resolve({ refs, ctx }) {
		const reader = await slackReader(ctx);
		const [raw, channel, grantChannel] = await Promise.all([
			read(reader, refs.channel, refs.ts),
			conversationInfo(reader, refs.channel),
			refs.grant_channel ? conversationInfo(reader, refs.grant_channel) : null,
		]);
		const parsed = messageSchema.safeParse(raw);
		if (!parsed.success)
			throw new CardUnavailable(
				"error",
				"Slack answered in a shape this card does not know",
			);
		const message = parsed.data;
		const workspace = await workspaceOf(reader, [
			...(message.user ? [message.user] : []),
			...(refs.grant_user ? [refs.grant_user] : []),
		]);
		const grantee = refs.grant_user
			? workspace.people.get(refs.grant_user)
			: undefined;
		if (refs.grant_user && !grantee)
			throw new CardUnavailable(
				"gone",
				"The person this request is for is not in Slack for you",
			);
		const alreadyMember =
			grantChannel && refs.grant_user
				? (await membersOf(reader, grantChannel.id)).has(refs.grant_user)
				: false;
		const shown = toConversation(channel, workspace.people);
		const grantShown = grantChannel
			? toConversation(grantChannel, workspace.people)
			: null;
		const ownControls = hasOwnControls(raw);
		const view: SlackRequestView = {
			kind: "slack.request",
			workspace: reader.workspace,
			channel: {
				id: channel.id,
				name:
					shown.kind === "dm" || shown.kind === "group"
						? shown.name
						: `#${shown.name}`,
				external: shown.external,
			},
			permalink: `${reader.url}/archives/${refs.channel}/p${refs.ts.replace(".", "")}`,
			message: toMessageView(message, {
				known: workspace.people,
				appUserId: undefined,
				appName: "App",
				readerId: reader.userId,
				permalinkBase: `${reader.url}/archives/${refs.channel}`,
				fileUrl: () => null,
			}),
			grant:
				grantee && grantShown
					? {
							person: grantee,
							guest: workspace.users.get(grantee.id)?.is_restricted ?? false,
							channel: grantShown,
							alreadyMember,
						}
					: null,
			ownButtons: ownControls,
			approveReply: refs.approve_reply ?? "",
			denyReply: refs.deny_reply ?? "",
			compose: workspace.compose,
		};
		const outside =
			shown.external || grantShown?.external || grantee?.team != null;
		const fields: CardField[] = [
			{ label: "From", value: view.message.user.name },
			{ label: "In", value: view.channel.name },
			...(view.grant
				? [
						{
							label: "Approving adds",
							value: `${view.grant.person.name} to #${view.grant.channel.name}`,
						},
					]
				: []),
			...(outside
				? [{ label: "Shared", value: "With people outside your organization" }]
				: []),
		];
		return {
			title: (message.text ?? "").split("\n")[0]?.slice(0, 120) || "Request",
			subtitle: view.channel.name,
			fields,
			body: message.text?.slice(0, 500) || undefined,
			view,
			data: {
				reader,
				channel,
				thread: typeof raw.thread_ts === "string" ? raw.thread_ts : message.ts,
				requester: view.message.user.name,
				grant:
					grantee && grantChannel
						? {
								user: grantee.id,
								name: grantee.name,
								channel: grantChannel,
								alreadyMember,
							}
						: null,
				ownControls,
			},
		};
	},
	actions: {
		approve: {
			label: (data) =>
				data.grant
					? `Add ${data.grant.name} to #${data.grant.channel.name}`
					: "Approve",
			style: "primary",
			role: "primary",
			available: (data) =>
				answerable(data) !== true
					? answerable(data)
					: data.grant?.channel.is_member === false
						? `Join #${data.grant.channel.name} in Slack to add people to it`
						: true,
			run: withInput(
				z.object({
					reply: replyInputSchema.nullable().optional(),
					/** The grant the reader saw, from the view. */
					grant: z.object({ user: z.string(), channel: z.string() }).nullable(),
				}),
				async ({ data, input }) => {
					const { grant } = data;
					if (
						(input.grant?.user ?? null) !== (grant?.user ?? null) ||
						(input.grant?.channel ?? null) !== (grant?.channel.id ?? null)
					)
						throw new CardUnavailable("error", CHANGED_SINCE_CONFIRM);
					if (!grant && !input.reply)
						throw new CardUnavailable("error", "An approval needs a reply");
					const adds = grant !== null && !grant.alreadyMember;
					if (grant && adds)
						await slack(
							data.reader.token,
							"conversations.invite",
							z.object({ ok: z.boolean() }),
							{ channel: grant.channel.id, users: grant.user },
							true,
						);
					const did = grant
						? adds
							? `Added ${grant.name} to #${grant.channel.name}`
							: `${grant.name} was in #${grant.channel.name} already`
						: "Approved";
					const granted = grant
						? { user: grant.user, channel: grant.channel.id }
						: null;
					try {
						const ts = await reply(data, input.reply);
						return {
							outcome: { approved: true, granted, reply: ts },
							notice: {
								tone: "good",
								text: ts ? `${did}, and replied to ${data.requester}` : did,
							},
						};
					} catch (error) {
						if (!adds) throw error;
						return {
							outcome: { approved: true, granted, reply: null },
							notice: {
								tone: "warn",
								text: `${did}. The reply was not sent: ${error instanceof CardUnavailable ? error.text : "Slack did not answer"}`,
							},
						};
					}
				},
			),
		},
		deny: {
			label: () => "Deny",
			style: "danger",
			role: "other",
			available: answerable,
			run: withInput(
				z.object({ reply: replyInputSchema }),
				async ({ data, input }) => {
					const ts = await reply(data, input.reply);
					return {
						outcome: { approved: false, reply: ts },
						notice: {
							tone: "neutral",
							text: `Denied, and replied to ${data.requester}`,
						},
					};
				},
			),
		},
		dismiss: {
			label: () => "Leave it",
			style: "secondary",
			role: "dismiss",
			async run() {
				return { outcome: { answered: false } };
			},
		},
	},
});
