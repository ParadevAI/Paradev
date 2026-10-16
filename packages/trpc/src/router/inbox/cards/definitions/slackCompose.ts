import { z } from "zod";
import {
	type CardContext,
	CardUnavailable,
	type SlackComposeContextView,
	type SlackConversationView,
	type SlackPersonView,
} from "../types";
import { type SlackUser, slackUser, toPerson } from "./slackMessages";
import {
	CONNECT,
	channelDirectory,
	customEmoji,
	lookUpPeople,
	MEMBERS_MAX,
	readerToken,
	SLACK_USER_ID,
	slack,
	teams,
	userGroups,
	workspaceDirectory,
} from "./slackWorkspace";

export const SLACK_USER = SLACK_USER_ID;
export const SLACK_CHANNEL = /^[CGD][A-Z0-9]{6,20}$/;
export const DRAFT_MAX = 8000;
const CONVERSATIONS_TTL_MS = 5 * 60_000;
const CONVERSATIONS_MAX = 1000;

export interface Reader {
	token: string;
	userId: string;
	teamId: string;
	workspace: string;
	url: string;
}

/** These cards act as the reader, so they need the reader's own Slack account, not the organization's app. */
export async function slackReader(ctx: CardContext): Promise<Reader> {
	const reader = await readerToken(ctx.organizationId, ctx.readerId);
	if (!reader)
		throw new CardUnavailable(
			"no_connector",
			"Connect your Slack account to do this as you",
			CONNECT,
		);
	const auth = await slack(
		reader.token,
		"auth.test",
		z.object({
			user_id: z.string(),
			team_id: z.string(),
			team: z.string(),
			url: z.string(),
		}),
		{},
	);
	return {
		token: reader.token,
		userId: auth.user_id,
		teamId: auth.team_id,
		workspace: auth.team,
		url: auth.url.replace(/\/$/, ""),
	};
}

export interface Workspace {
	users: Map<string, SlackUser>;
	people: Map<string, SlackPersonView>;
	compose: SlackComposeContextView;
}

/** The people, channels, groups and emoji of the reader's workspace, as the thread card's composer takes them. A person from another organization carries that organization, which is how a card marks them. */
export async function workspaceOf(
	reader: Reader,
	alsoPeople: string[] = [],
): Promise<Workspace> {
	const [directory, channels, groups, emoji] = await Promise.all([
		workspaceDirectory(reader.token),
		channelDirectory(reader.token),
		userGroups(reader.token),
		customEmoji(reader.token),
	]);
	const listed = new Set(directory.map((user) => user.id));
	const extra = await lookUpPeople(
		reader.token,
		[reader.userId, ...alsoPeople].filter((id) => !listed.has(id)),
	);
	const everyone = [...directory, ...extra];
	const outside = await teams(reader.token, [
		...new Set(
			everyone.flatMap((user) =>
				user.team_id && user.team_id !== reader.teamId ? [user.team_id] : [],
			),
		),
	]);
	const users = new Map<string, SlackUser>();
	const people = new Map<string, SlackPersonView>();
	for (const user of everyone) {
		const person = toPerson(user);
		person.isReader = user.id === reader.userId;
		person.inChannel = true;
		if (user.team_id && user.team_id !== reader.teamId) {
			const team = outside.get(user.team_id);
			person.team = {
				id: user.team_id,
				name: team?.name ?? "Another organization",
				icon: team?.icon ?? null,
			};
		}
		users.set(user.id, user);
		people.set(user.id, person);
	}
	return {
		users,
		people,
		compose: {
			members: [...people.values()]
				.filter((person) => !person.isBot)
				.sort((a, b) => a.name.localeCompare(b.name))
				.slice(0, MEMBERS_MAX),
			names: Object.fromEntries(
				[...people.values()].map((person) => [person.id, person.name]),
			),
			channels,
			groups,
			emoji,
		},
	};
}

const conversationSchema = z.object({
	id: z.string(),
	name: z.string().optional(),
	is_private: z.boolean().optional(),
	is_im: z.boolean().optional(),
	is_mpim: z.boolean().optional(),
	is_ext_shared: z.boolean().optional(),
	is_archived: z.boolean().optional(),
	is_member: z.boolean().optional(),
	num_members: z.number().optional(),
	user: z.string().optional(),
	creator: z.string().optional(),
	created: z.number().optional(),
});
export type RawConversation = z.infer<typeof conversationSchema>;

export function toConversation(
	raw: RawConversation,
	people: Map<string, SlackPersonView>,
): SlackConversationView {
	return {
		id: raw.id,
		kind: raw.is_im
			? "dm"
			: raw.is_mpim
				? "group"
				: raw.is_private
					? "private"
					: "channel",
		name: raw.is_im
			? (people.get(raw.user ?? "")?.name ?? raw.user ?? raw.id)
			: (raw.name ?? raw.id),
		members: raw.num_members ?? null,
		external: raw.is_ext_shared ?? false,
	};
}

export async function conversationInfo(
	reader: Reader,
	channel: string,
): Promise<RawConversation> {
	const info = await slack(
		reader.token,
		"conversations.info",
		z.object({ channel: conversationSchema }),
		{ channel, include_num_members: "true" },
	);
	return info.channel;
}

const MEMBERS_PAGE = 1000;
const MEMBERS_READ_MAX = 5000;

export async function membersOf(
	reader: Reader,
	channel: string,
): Promise<Set<string>> {
	const members = new Set<string>();
	let cursor: string | undefined;
	do {
		const page = await slack(
			reader.token,
			"conversations.members",
			z.object({
				members: z.array(z.string()),
				response_metadata: z
					.object({ next_cursor: z.string().optional() })
					.optional(),
			}),
			{ channel, limit: String(MEMBERS_PAGE), ...(cursor ? { cursor } : {}) },
		);
		for (const id of page.members) members.add(id);
		cursor = page.response_metadata?.next_cursor || undefined;
	} while (cursor && members.size < MEMBERS_READ_MAX);
	return members;
}

const conversationsCache = new Map<
	string,
	{ at: number; list: RawConversation[] }
>();

/** The channels the reader is a member of: the only ones they can post in. */
export async function readerChannels(
	reader: Reader,
): Promise<RawConversation[]> {
	const cached = conversationsCache.get(reader.token);
	if (cached && Date.now() - cached.at < CONVERSATIONS_TTL_MS)
		return cached.list;
	const list: RawConversation[] = [];
	let cursor: string | undefined;
	do {
		const page = await slack(
			reader.token,
			"users.conversations",
			z.object({
				channels: z.array(conversationSchema),
				response_metadata: z
					.object({ next_cursor: z.string().optional() })
					.optional(),
			}),
			{
				types: "public_channel,private_channel",
				exclude_archived: "true",
				limit: "200",
				...(cursor ? { cursor } : {}),
			},
		);
		list.push(...page.channels);
		cursor = page.response_metadata?.next_cursor || undefined;
	} while (cursor && list.length < CONVERSATIONS_MAX);
	conversationsCache.set(reader.token, { at: Date.now(), list });
	return list;
}

export function forgetChannels(reader: Reader): void {
	conversationsCache.delete(reader.token);
}

export async function readerUser(reader: Reader): Promise<SlackUser> {
	const info = await slack(
		reader.token,
		"users.info",
		z.object({ user: slackUser }),
		{ user: reader.userId },
	);
	return info.user;
}

export async function timezoneOf(reader: Reader): Promise<string> {
	return (await readerUser(reader)).tz ?? "UTC";
}

export function idList(value: string | undefined): string[] {
	return [
		...new Set(
			(value ?? "")
				.split(",")
				.map((id) => id.trim())
				.filter(Boolean),
		),
	];
}

export function dayAndTime(time: number, timeZone: string): string {
	return new Intl.DateTimeFormat("en-US", {
		month: "short",
		day: "numeric",
		year: "numeric",
		hour: "numeric",
		minute: "2-digit",
		timeZoneName: "short",
		timeZone,
	}).format(time);
}

export const headcount = (count: number) =>
	count === 1 ? "1 person" : `${count} people`;
