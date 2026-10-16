import { z } from "zod";
import {
	type CardField,
	CardUnavailable,
	CHANGED_SINCE_CONFIRM,
	defineCard,
	type SlackChannelView,
	type SlackInviteeView,
	withInput,
} from "../types";
import {
	conversationInfo,
	forgetChannels,
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
import { botFor, isSlack, slack } from "./slackWorkspace";

interface Refs {
	action: "invite" | "create" | "connect";
	channel?: string;
	name?: string;
	private?: boolean;
	users?: string;
	emails?: string;
	created?: boolean;
	invited?: string;
}

interface Data {
	reader: Reader;
	mode: Refs["action"];
	channel: RawConversation | null;
	workspace: Workspace;
	members: Set<string>;
	where: string;
	appInChannel: boolean;
	mayInviteOutside: boolean;
	organizationId: string;
	/** What an earlier, partly finished run of this card already did. */
	created: boolean;
	invitedBefore: string[];
}

const INVITE_MAX = 30;
const EMAILS_MAX = 10;
const RECENT_S = 60 * 60;
const CHANNEL_NAME = /^[\p{Ll}\p{Lo}\p{N}_-]{1,80}$/u;
const EMAIL = /^[^\s<>,;"@]+@[^\s<>,;"@]+\.[^\s<>,;"@]+$/;
const NAME_RULE =
	"Channel names can’t contain spaces or punctuation. Use dashes to separate words";

const userIds = z.array(z.string().regex(SLACK_USER)).max(INVITE_MAX);

const failure = (error: unknown) =>
	error instanceof CardUnavailable ? error.text : "Slack did not answer";

function invitees(data: Data, ids: string[]): SlackInviteeView[] {
	return ids.map((id) => {
		const person = data.workspace.people.get(id);
		if (!person)
			throw new CardUnavailable(
				"error",
				"Someone on this list is not in Slack for you",
			);
		return {
			person,
			guest: data.workspace.users.get(id)?.is_restricted ?? false,
			alreadyMember: data.members.has(id),
		};
	});
}

/** Slack adds people in one request and refuses the whole request for one bad id, so the ones already in are left out first. */
async function add(
	data: Data,
	channel: string,
	ids: string[],
	members: Set<string>,
): Promise<string[]> {
	const invite = (users: string[]) =>
		slack(
			data.reader.token,
			"conversations.invite",
			z.object({ ok: z.boolean() }),
			{ channel, users: users.join(",") },
			true,
		);
	const fresh = invitees(data, ids)
		.filter(
			(invitee) => !members.has(invitee.person.id) && !invitee.person.isReader,
		)
		.map((invitee) => invitee.person.id);
	if (!fresh.length) return fresh;
	try {
		await invite(fresh);
	} catch (error) {
		if (!isSlack(error, "already_in_channel")) throw error;
		const inside = await membersOf(data.reader, channel);
		const left = fresh.filter((id) => !inside.has(id));
		if (left.length) await invite(left);
	}
	return fresh;
}

const memberOnly = (data: Data): true | string =>
	data.channel?.is_archived
		? "That channel is archived"
		: data.channel?.is_member === false
			? `Join ${data.where} in Slack first`
			: true;

/** Adding people to a channel, making a channel, or inviting people from another organization to one. */
export const slackChannel = defineCard<Refs, Data>({
	type: "slack.channel",
	label: "Slack channel",
	ask: "Approve channel change",
	brand: "slack",
	refs: z
		.object({
			action: z.enum(["invite", "create", "connect"]),
			channel: z.string().regex(SLACK_CHANNEL).optional(),
			name: z.string().max(80).optional(),
			private: z.boolean().optional(),
			/** Comma-separated Slack user ids. */
			users: z.string().max(700).optional(),
			/** Comma-separated addresses, for a Slack Connect invitation. */
			emails: z.string().max(700).optional(),
			/** Set by the card itself when an earlier run made the channel or sent some invitations. */
			created: z.boolean().optional(),
			invited: z.string().max(700).optional(),
		})
		.refine((refs) => refs.action === "create" || Boolean(refs.channel)),
	async resolve({ refs, ctx }) {
		const reader = await slackReader(ctx);
		const ids = idList(refs.users).slice(0, INVITE_MAX);
		const [workspace, channel] = await Promise.all([
			workspaceOf(reader, ids),
			refs.channel ? conversationInfo(reader, refs.channel) : null,
		]);
		const [members, appInChannel] = await Promise.all([
			channel ? membersOf(reader, channel.id) : new Set<string>(),
			channel && refs.action === "connect"
				? botFor(ctx.organizationId, channel.id).then(
						({ token }) =>
							slack(
								token,
								"conversations.info",
								z.object({
									channel: z.object({ is_member: z.boolean().optional() }),
								}),
								{ channel: channel.id },
							).then(
								(info) => info.channel.is_member === true,
								() => false,
							),
						() => false,
					)
				: false,
		]);
		const shown = channel ? toConversation(channel, workspace.people) : null;
		const where = shown ? `#${shown.name}` : `#${refs.name ?? ""}`;
		const data: Data = {
			reader,
			mode: refs.action,
			channel,
			workspace,
			members,
			where,
			appInChannel,
			mayInviteOutside: ["primary_owner", "owner", "admin"].includes(
				workspace.people.get(reader.userId)?.role ?? "",
			),
			organizationId: ctx.organizationId,
			created: refs.created ?? false,
			invitedBefore: idList(refs.invited),
		};
		const emails = idList(refs.emails)
			.filter((email) => EMAIL.test(email))
			.slice(0, EMAILS_MAX);
		const view: SlackChannelView = {
			kind: "slack.channel",
			workspace: reader.workspace,
			mode: refs.action,
			channel: shown
				? { ...shown, url: `${reader.url}/archives/${shown.id}` }
				: null,
			proposed: {
				name: (refs.name ?? "").toLowerCase(),
				private: refs.private ?? false,
			},
			invitees: invitees(
				data,
				ids.filter((id) => workspace.people.has(id)),
			),
			emails,
			directory: workspace.compose.members,
			appInChannel,
		};
		const fields: CardField[] = [
			{ label: "Channel", value: where },
			...(shown
				? [
						{
							label: "Visibility",
							value: shown.kind === "private" ? "Private" : "Public",
						},
					]
				: [
						{
							label: "Visibility",
							value: view.proposed.private ? "Private" : "Public",
						},
					]),
			...(shown?.external ||
			view.invitees.some((invitee) => invitee.person.team !== null)
				? [{ label: "Shared", value: "With people outside your organization" }]
				: []),
			...(view.invitees.length
				? [
						{
							label: "People",
							value: view.invitees
								.map((invitee) => invitee.person.name)
								.join(", "),
						},
					]
				: []),
			...(emails.length ? [{ label: "Invite", value: emails.join(", ") }] : []),
		];
		return {
			title: where,
			subtitle: reader.workspace,
			status: refs.created
				? { tone: "warn", text: "Created; people not added yet" }
				: refs.invited
					? { tone: "warn", text: "Some invitations were sent" }
					: undefined,
			fields,
			view,
			data,
		};
	},
	actions: {
		invite: {
			label: () => "Add to channel",
			style: "primary",
			role: "primary",
			applies: (data) => data.mode === "invite",
			available: memberOnly,
			run: withInput(
				z.object({
					channel: z.string().regex(SLACK_CHANNEL),
					users: userIds.min(1),
				}),
				async ({ data, input }) => {
					const channel = data.channel;
					if (!channel || input.channel !== channel.id)
						throw new CardUnavailable("error", CHANGED_SINCE_CONFIRM);
					const added = await add(data, channel.id, input.users, data.members);
					return {
						outcome: {
							invited: added,
							channel: channel.id,
							...(data.created ? { created: channel.id } : {}),
						},
						notice: {
							tone: "good",
							text: added.length
								? `Added ${headcount(added.length)} to ${data.where}`
								: `Everyone was in ${data.where} already`,
						},
					};
				},
			),
		},
		create: {
			label: () => "Create channel",
			style: "primary",
			role: "primary",
			applies: (data) => data.mode === "create",
			run: withInput(
				z.object({
					name: z.string().trim().min(1).max(80),
					private: z.boolean(),
					users: userIds.default([]),
				}),
				async ({ data, input }) => {
					const { reader } = data;
					if (!CHANNEL_NAME.test(input.name))
						throw new CardUnavailable("error", NAME_RULE);
					const made = await slack(
						reader.token,
						"conversations.create",
						z.object({ channel: z.object({ id: z.string() }) }),
						{ name: input.name, is_private: input.private },
						true,
					).catch(async (error) => {
						if (!isSlack(error, "name_taken")) throw error;
						forgetChannels(reader);
						const mine = (await readerChannels(reader)).find(
							(each) =>
								each.name === input.name &&
								each.creator === reader.userId &&
								(each.is_private ?? false) === input.private &&
								(each.created ?? 0) > Date.now() / 1000 - RECENT_S,
						);
						if (!mine) throw error;
						return { channel: { id: mine.id } };
					});
					forgetChannels(reader);
					const inside = await membersOf(reader, made.channel.id);
					let added: string[];
					try {
						added = await add(data, made.channel.id, input.users, inside);
					} catch (error) {
						return {
							terminal: false,
							outcome: {
								created: made.channel.id,
								name: input.name,
								invited: [],
							},
							refs: {
								action: "invite",
								channel: made.channel.id,
								users: input.users.join(","),
								created: true,
							},
							notice: {
								tone: "warn",
								text: `Created #${input.name}. People were not added: ${failure(error)}`,
							},
						};
					}
					return {
						outcome: {
							created: made.channel.id,
							name: input.name,
							private: input.private,
							invited: added,
						},
						notice: {
							tone: "good",
							text: added.length
								? `Created #${input.name} and added ${headcount(added.length)}`
								: `Created #${input.name}`,
						},
					};
				},
			),
		},
		connect: {
			label: () => "Send invitation",
			style: "primary",
			role: "primary",
			applies: (data) => data.mode === "connect",
			available: (data) =>
				memberOnly(data) !== true
					? memberOnly(data)
					: !data.mayInviteOutside
						? "Only a Slack owner or admin can invite people from outside through this card"
						: data.appInChannel
							? true
							: `Add the Superset app to ${data.where} first; it sends the invitation`,
			run: withInput(
				z.object({
					channel: z.string().regex(SLACK_CHANNEL),
					emails: z.array(z.string().regex(EMAIL)).min(1).max(EMAILS_MAX),
				}),
				async ({ data, input }) => {
					const channel = data.channel;
					if (!channel || input.channel !== channel.id)
						throw new CardUnavailable("error", CHANGED_SINCE_CONFIRM);
					const { token } = await botFor(data.organizationId, channel.id);
					const sent: string[] = [];
					for (const email of input.emails) {
						try {
							await slack(
								token,
								"conversations.inviteShared",
								z.object({ ok: z.boolean() }),
								{ channel: channel.id, emails: email, external_limited: true },
								true,
							);
						} catch (error) {
							if (!sent.length) throw error;
							return {
								terminal: false,
								outcome: { connectInvited: sent, channel: channel.id },
								refs: {
									emails: input.emails
										.filter((each) => !sent.includes(each))
										.join(","),
									invited: [...data.invitedBefore, ...sent].join(","),
								},
								notice: {
									tone: "warn",
									text: `Invited ${sent.join(", ")}. ${email} was not invited: ${failure(error)}`,
								},
							};
						}
						sent.push(email);
					}
					return {
						outcome: {
							connectInvited: [...data.invitedBefore, ...sent],
							channel: channel.id,
						},
						notice: {
							tone: "good",
							text: `Invited ${sent.join(", ")} to ${data.where} through Slack Connect`,
						},
					};
				},
			),
		},
		dismiss: {
			label: () => "Leave it",
			style: "secondary",
			role: "dismiss",
			async run({ data }) {
				return {
					outcome: {
						changed: data.created || data.invitedBefore.length > 0,
						...(data.created && data.channel
							? { created: data.channel.id }
							: {}),
						...(data.invitedBefore.length
							? { connectInvited: data.invitedBefore }
							: {}),
					},
				};
			},
		},
	},
});
