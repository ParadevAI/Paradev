import { z } from "zod";
import {
	type CardField,
	CardUnavailable,
	CHANGED_SINCE_CONFIRM,
	defineCard,
	type SlackPersonView,
	type SlackPostView,
	withInput,
} from "../types";
import {
	conversationInfo,
	DRAFT_MAX,
	dayAndTime,
	headcount,
	idList,
	membersOf,
	type RawConversation,
	type Reader,
	readerChannels,
	SLACK_CHANNEL,
	SLACK_USER,
	slackReader,
	toConversation,
	type Workspace,
	workspaceOf,
} from "./slackCompose";
import { replyParams, slack } from "./slackWorkspace";

interface Refs {
	to: string;
	draft?: string;
	post_at?: string;
}

interface Data {
	reader: Reader;
	to: string;
	channel: RawConversation | null;
	recipients: SlackPersonView[];
	where: string;
	notifies: number | null;
	groupSizes: Record<string, number>;
	timezone: string;
}

const GROUP_MAX = 8;
const SCHEDULE_DAYS_MAX = 120;
const SCHEDULE_LEAD_MS = 60_000;
const DAY_MS = 24 * 60 * 60 * 1000;
const MEMBERS_COUNTED_MAX = 5000;
const BROADCAST = /<!(channel|here|everyone)(\|[^>]*)?>/;
const GROUP = /<!subteam\^([A-Z0-9]+)/g;
export const TO =
	/^([CGD][A-Z0-9]{6,20}|[UW][A-Z0-9]{6,20}(,[UW][A-Z0-9]{6,20}){0,7})$/;

export const messageBody = z.object({
	text: z.string().trim().min(1).max(DRAFT_MAX),
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
type Body = z.infer<typeof messageBody>;

function elements(value: unknown): Record<string, unknown>[] {
	if (!value || typeof value !== "object") return [];
	const node = value as Record<string, unknown>;
	const inner = Array.isArray(node.elements) ? node.elements : [];
	return [node, ...inner.flatMap(elements)];
}

const richText = (input: Body) => (input.blocks ?? []).flatMap(elements);

export function mentionsEveryone(input: Body): boolean {
	return (
		BROADCAST.test(input.text) ||
		richText(input).some((element) => element.type === "broadcast")
	);
}

export function groupsMentioned(input: Body): string[] {
	return [
		...new Set([
			...[...input.text.matchAll(GROUP)].map((match) => match[1] ?? ""),
			...richText(input).flatMap((element) =>
				element.type === "usergroup" && typeof element.usergroup_id === "string"
					? [element.usergroup_id]
					: [],
			),
		]),
	];
}

/** The number Slack shows for a channel is its people; `num_members` counts apps too, so it serves only a channel too large to list. */
async function notified(
	reader: Reader,
	channel: RawConversation,
	workspace: Workspace,
): Promise<number> {
	const total = channel.num_members ?? 0;
	if (total > MEMBERS_COUNTED_MAX) return Math.max(0, total - 1);
	const members = await membersOf(reader, channel.id);
	return [...members].filter(
		(id) => id !== reader.userId && workspace.users.get(id)?.is_bot !== true,
	).length;
}

async function groupSizes(reader: Reader): Promise<Record<string, number>> {
	const listed = await slack(
		reader.token,
		"usergroups.list",
		z.object({
			usergroups: z.array(
				z.object({ id: z.string(), user_count: z.number().optional() }),
			),
		}),
		{ include_count: "true" },
	).catch(() => ({ usergroups: [] }));
	return Object.fromEntries(
		listed.usergroups.map((group) => [group.id, group.user_count ?? 0]),
	);
}

async function open(reader: Reader, data: Data): Promise<string> {
	if (data.channel) return data.channel.id;
	const opened = await slack(
		reader.token,
		"conversations.open",
		z.object({ channel: z.object({ id: z.string() }) }),
		{ users: data.recipients.map((person) => person.id).join(",") },
		true,
	);
	return opened.channel.id;
}

export const slackPost = defineCard<Refs, Data>({
	type: "slack.message",
	label: "Slack message",
	ask: "Approve message",
	brand: "slack",
	refs: z.object({
		to: z.string().regex(TO),
		draft: z.string().max(DRAFT_MAX).optional(),
		post_at: z.string().datetime({ offset: true }).optional(),
	}),
	async resolve({ refs, ctx }) {
		const reader = await slackReader(ctx);
		const toPeople = SLACK_USER.test(refs.to.split(",")[0] ?? "")
			? idList(refs.to)
			: [];
		const channel = toPeople.length
			? null
			: await conversationInfo(reader, refs.to);
		const direct = channel?.is_im || channel?.is_mpim;
		const inside =
			channel && direct
				? [...(await membersOf(reader, channel.id))].filter(
						(id) => id !== reader.userId,
					)
				: [];
		const [workspace, channels, sizes] = await Promise.all([
			workspaceOf(reader, [...toPeople, ...inside]),
			readerChannels(reader),
			groupSizes(reader),
		]);
		const self = workspace.people.get(reader.userId);
		if (!self)
			throw new CardUnavailable("error", "Slack does not list your account");
		const recipients = (
			direct && inside.length === 0 ? [reader.userId] : [...toPeople, ...inside]
		).map((id) => {
			const person = workspace.people.get(id);
			if (!person)
				throw new CardUnavailable(
					"gone",
					"Someone this message is for is not in Slack for you",
				);
			return person;
		});
		const names = recipients.map((person) => person.name).join(", ");
		const target =
			channel && !direct
				? toConversation(channel, workspace.people)
				: {
						id: refs.to,
						kind: recipients.length > 1 ? ("group" as const) : ("dm" as const),
						name: names,
						members: recipients.length + 1,
						external: recipients.some((person) => person.team !== null),
					};
		const where =
			target.kind === "dm" || target.kind === "group"
				? target.name
				: `#${target.name}`;
		const notifies =
			channel && !direct ? await notified(reader, channel, workspace) : null;
		const timezone = self.timezone ?? "UTC";
		const postAt = refs.post_at ? Date.parse(refs.post_at) : null;
		const view: SlackPostView = {
			kind: "slack.message",
			workspace: reader.workspace,
			reader: self,
			target,
			recipients,
			destinations: channels
				.map((each) => toConversation(each, workspace.people))
				.sort((a, b) => a.name.localeCompare(b.name)),
			compose: workspace.compose,
			draft: refs.draft ?? "",
			postAt:
				postAt !== null && postAt > Date.now()
					? new Date(postAt).toISOString()
					: null,
			stale: postAt !== null && postAt <= Date.now(),
			timezone,
			notifies,
			groupSizes: sizes,
		};
		const fields: CardField[] = [
			{ label: "To", value: where },
			...(channel && !direct && target.members !== null
				? [{ label: "People", value: String((notifies ?? 0) + 1) }]
				: []),
			...(target.external
				? [{ label: "Shared", value: "With people outside your organization" }]
				: []),
			...(view.postAt
				? [
						{
							label: "Send at",
							value: dayAndTime(Date.parse(view.postAt), timezone),
						},
					]
				: []),
		];
		return {
			title: where,
			subtitle: reader.workspace,
			fields,
			body: refs.draft?.slice(0, 500) || undefined,
			view,
			data: {
				reader,
				to: refs.to,
				channel,
				recipients,
				where,
				notifies,
				groupSizes: sizes,
				timezone,
			},
		};
	},
	actions: {
		send: {
			label: () => "Send",
			style: "primary",
			role: "primary",
			available: (data) =>
				data.channel?.is_archived
					? "That channel is archived"
					: data.channel &&
							!data.channel.is_im &&
							!data.channel.is_mpim &&
							data.channel.is_member === false
						? `Join ${data.where} in Slack to post there`
						: true,
			run: withInput(
				messageBody.extend({
					/** `target.id` from the view: the place the reader saw. */
					to: z.string().regex(TO),
					postAt: z.string().datetime({ offset: true }).nullable().optional(),
					/** `notifies` from the view, when the message has @channel, @here or @everyone. */
					notifies: z.number().int().min(0).nullable().optional(),
					/** The summed sizes of the user groups the message mentions. */
					groupNotifies: z.number().int().min(0).optional(),
				}),
				async ({ data, input }) => {
					const { reader } = data;
					if (input.to !== data.to)
						throw new CardUnavailable("error", CHANGED_SINCE_CONFIRM);
					if (
						mentionsEveryone(input) &&
						(input.notifies ?? null) !== data.notifies
					)
						throw new CardUnavailable(
							"error",
							data.notifies === null
								? CHANGED_SINCE_CONFIRM
								: `This notifies ${headcount(data.notifies)} in ${data.where}. Read it again before you send`,
						);
					const groups = groupsMentioned(input);
					if (groups.some((id) => data.groupSizes[id] === undefined))
						throw new CardUnavailable(
							"error",
							"Slack did not say how many people are in a group this mentions",
						);
					const inGroups = groups.reduce(
						(sum, id) => sum + (data.groupSizes[id] ?? 0),
						0,
					);
					if (groups.length && input.groupNotifies !== inGroups)
						throw new CardUnavailable(
							"error",
							`This notifies ${headcount(inGroups)} in the groups it mentions. Read it again before you send`,
						);
					const at = input.postAt ? Date.parse(input.postAt) : null;
					if (at !== null && at < Date.now() + SCHEDULE_LEAD_MS)
						throw new CardUnavailable("error", "That time has passed");
					if (at !== null && at > Date.now() + SCHEDULE_DAYS_MAX * DAY_MS)
						throw new CardUnavailable(
							"error",
							"Slack schedules messages up to 120 days ahead",
						);
					const channel = await open(reader, data);
					const message = { channel, ...replyParams(input) };
					if (at !== null) {
						const scheduled = await slack(
							reader.token,
							"chat.scheduleMessage",
							z.object({ scheduled_message_id: z.string() }),
							{ ...message, post_at: Math.floor(at / 1000) },
							true,
						);
						return {
							outcome: {
								scheduled: scheduled.scheduled_message_id,
								channel,
								postAt: new Date(at).toISOString(),
							},
							notice: {
								tone: "good",
								text: `Scheduled for ${data.where} on ${dayAndTime(at, data.timezone)}`,
							},
						};
					}
					const posted = await slack(
						reader.token,
						"chat.postMessage",
						z.object({ ts: z.string() }),
						message,
						true,
					);
					return {
						outcome: { sent: true, ts: posted.ts, channel },
						notice: { tone: "good", text: `Sent to ${data.where}` },
					};
				},
			),
		},
		retarget: {
			label: () => "Change where it goes",
			style: "secondary",
			role: "other",
			terminal: false,
			run: withInput(
				z.object({
					to: z.union([
						z.string().regex(SLACK_CHANNEL),
						z.array(z.string().regex(SLACK_USER)).min(1).max(GROUP_MAX),
					]),
				}),
				async ({ input }) => ({
					outcome: { retargeted: true },
					refs: {
						to: typeof input.to === "string" ? input.to : input.to.join(","),
					},
				}),
			),
		},
		dismiss: {
			label: () => "Do not send",
			style: "secondary",
			role: "dismiss",
			async run() {
				return { outcome: { sent: false } };
			},
		},
	},
});
