import { db } from "@superset/db/client";
import { userIdentities } from "@superset/db/schema";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import {
	type CardField,
	CardUnavailable,
	defineCard,
	type SlackPersonView,
	type SlackThreadView,
	withInput,
} from "../types";
import { slackFileUrl } from "./slackFiles";
import {
	messageSchema,
	type SlackMessage,
	toMessageView,
	toPerson,
} from "./slackMessages";
import {
	botFor,
	channelDirectory,
	customEmoji,
	isSlack,
	lookUpPeople,
	MEMBERS_MAX,
	presenceOf,
	readerOnly,
	readerToken,
	replyInputSchema,
	replyParams,
	SLACK_ID,
	SLACK_TS,
	SLACK_USER_ID,
	slack,
	teams,
	userGroups,
	workspaceDirectory,
} from "./slackWorkspace";

export {
	botFor,
	readerOnly,
	SLACK_ID,
	SLACK_TS,
	slack,
} from "./slackWorkspace";

const REPLIES_PAGE = 200;
const REPLIES_MAX = 600;
const CHANNEL_LOOKUPS_MAX = 10;

interface ThreadData {
	channelId: string;
	channelName: string;
	threadTs: string;
	replies: number;
	botName: string;
}

export async function allReplies(
	token: string,
	channel: string,
	threadTs: string,
): Promise<SlackMessage[]> {
	const messages: SlackMessage[] = [];
	let cursor: string | undefined;
	do {
		const page = await slack(
			token,
			"conversations.replies",
			z.object({
				messages: z.array(messageSchema),
				response_metadata: z
					.object({ next_cursor: z.string().optional() })
					.optional(),
			}),
			{
				channel,
				ts: threadTs,
				limit: String(REPLIES_PAGE),
				...(cursor ? { cursor } : {}),
			},
		);
		messages.push(...page.messages);
		cursor = page.response_metadata?.next_cursor || undefined;
	} while (cursor && messages.length < REPLIES_MAX);
	return messages;
}

/** Channels the thread mentions that the directory lacks, like private ones the app is in. */
async function mentionedChannels(
	token: string,
	messages: SlackMessage[],
	known: Record<string, string>,
): Promise<Record<string, string>> {
	const raw = JSON.stringify(messages);
	const ids = new Set(
		[...raw.matchAll(/"channel_id":"(C[A-Z0-9]+)"|<#(C[A-Z0-9]+)/g)].map(
			(m) => m[1] ?? m[2] ?? "",
		),
	);
	const missing = [...ids].filter((id) => id && !known[id]);
	const found: Record<string, string> = {};
	await Promise.all(
		missing.slice(0, CHANNEL_LOOKUPS_MAX).map(async (id) => {
			const info = await slack(
				token,
				"conversations.info",
				z.object({ channel: z.object({ name: z.string() }) }),
				{ channel: id },
			).catch(() => null);
			if (info) found[id] = info.channel.name;
		}),
	);
	return found;
}

/** The reader's Slack user id in this workspace, when they linked their account. */
async function readSlackIdentity(
	organizationId: string,
	readerId: string,
	teamId: string | undefined,
): Promise<string | null> {
	if (!teamId) return null;
	const [row] = await db
		.select({ externalId: userIdentities.externalId })
		.from(userIdentities)
		.where(
			and(
				eq(userIdentities.organizationId, organizationId),
				eq(userIdentities.userId, readerId),
				eq(userIdentities.provider, "slack"),
				eq(userIdentities.externalScopeId, teamId),
			),
		)
		.limit(1);
	return row?.externalId ?? null;
}

/**
 * A question in a channel the agent drafted an answer to. Reading goes
 * through the organization's bot; replying, reacting and commands always go
 * out as the reader through their own Slack account.
 */
export const slackThread = defineCard<
	{ channel: string; thread_ts: string; draft?: string },
	ThreadData
>({
	type: "slack.thread",
	label: "Slack thread",
	ask: "Approve reply",
	askFor: (refs) => (refs.draft ? "Approve reply" : "Reply in thread"),
	brand: "slack",
	refs: z.object({
		channel: z.string().regex(SLACK_ID),
		thread_ts: z.string().regex(SLACK_TS),
		/** The agent's proposed reply in Slack mrkdwn, pre-filled for the reader to edit. */
		draft: z.string().max(500).optional(),
	}),
	async resolve({ refs, ctx }) {
		const { teamId, token } = await botFor(ctx.organizationId, refs.channel);
		const [messages, channel, auth, memberIds, emoji, channels, groups] =
			await Promise.all([
				allReplies(token, refs.channel, refs.thread_ts),
				slack(
					token,
					"conversations.info",
					z.object({ channel: z.object({ name: z.string().optional() }) }),
					{ channel: refs.channel },
				),
				slack(
					token,
					"auth.test",
					z.object({
						user: z.string().optional(),
						user_id: z.string().optional(),
						team_id: z.string().optional(),
						url: z.string().optional(),
					}),
					{},
				),
				slack(
					token,
					"conversations.members",
					z.object({ members: z.array(z.string()) }),
					{ channel: refs.channel, limit: "100" },
				).catch(() => ({ members: [] as string[] })),
				customEmoji(token),
				channelDirectory(token),
				userGroups(token),
			]);
		const root = messages[0];
		if (!root) {
			throw new CardUnavailable("gone", "That thread has no messages");
		}
		const participantIds = messages.flatMap((m) => (m.user ? [m.user] : []));
		const inChannel = new Set(memberIds.members);
		const directory = await workspaceDirectory(token);
		const listed = new Set(directory.map((u) => u.id));
		const unlisted = [
			...new Set([...participantIds, ...memberIds.members]),
		].filter((id) => !listed.has(id));
		const presenceFirst = [
			...new Set([...participantIds, ...memberIds.members]),
		];
		const [external, presence, reader, mentioned] = await Promise.all([
			lookUpPeople(token, unlisted),
			presenceOf(token, presenceFirst),
			readerToken(ctx.organizationId, ctx.readerId).catch(() => null),
			mentionedChannels(token, messages, channels),
		]);
		const readerId =
			reader?.slackUserId ??
			(await readSlackIdentity(ctx.organizationId, ctx.readerId, auth.team_id));
		const everyone = [...directory, ...external];
		const otherTeams = await teams(token, [
			...new Set(
				everyone.flatMap((u) =>
					u.team_id && u.team_id !== auth.team_id ? [u.team_id] : [],
				),
			),
		]);
		const known = new Map<string, SlackPersonView>();
		for (const user of everyone) {
			const person = toPerson(user);
			person.presence = presence.get(person.id) ?? null;
			person.inChannel = inChannel.has(person.id);
			person.isReader = person.id === readerId;
			if (user.team_id && user.team_id !== auth.team_id) {
				const team = otherTeams.get(user.team_id);
				person.team = {
					id: user.team_id,
					name: team?.name ?? user.team_id,
					icon: team?.icon ?? null,
				};
			}
			known.set(person.id, person);
		}
		const appName = auth.user ?? "Superset";
		const permalinkBase = auth.url
			? `${auth.url.replace(/\/$/, "")}/archives/${refs.channel}`
			: null;
		const views = messages.map((m) =>
			toMessageView(m, {
				known,
				appUserId: auth.user_id,
				appName,
				readerId,
				permalinkBase,
				fileUrl: (id) => slackFileUrl(ctx.organizationId, teamId, id),
			}),
		);
		const channelName = channel.channel.name
			? `#${channel.channel.name}`
			: refs.channel;
		const data: ThreadData = {
			channelId: refs.channel,
			channelName,
			threadTs: refs.thread_ts,
			replies: messages.length - 1,
			botName: appName,
		};
		const members = [...known.values()]
			.filter((p) => p.inChannel || !p.isBot)
			.sort(
				(a, b) =>
					Number(b.inChannel) - Number(a.inChannel) ||
					a.name.localeCompare(b.name),
			)
			.slice(0, MEMBERS_MAX);
		const view: SlackThreadView = {
			kind: "slack.thread",
			channel: { id: refs.channel, name: channelName },
			permalink: auth.url
				? `${auth.url.replace(/\/$/, "")}/archives/${refs.channel}/p${refs.thread_ts.replace(".", "")}`
				: null,
			messages: views,
			members,
			names: Object.fromEntries([...known.values()].map((p) => [p.id, p.name])),
			channels: { ...channels, ...mentioned },
			groups,
			emoji,
			readerConnected: reader !== null,
			draft: refs.draft ?? null,
		};
		const fields: CardField[] = [
			{ label: "Channel", value: channelName },
			{ label: "Asked by", value: views[0]?.user.name ?? "" },
			{ label: "Replies", value: String(data.replies) },
		];
		return {
			title: (root.text ?? "").split("\n")[0]?.slice(0, 120) || "Thread",
			subtitle: channelName,
			fields,
			view,
			data,
		};
	},
	actions: {
		reply: {
			label: () => "Reply in thread",
			style: "primary",
			role: "primary",
			input: "Your reply, in Slack formatting",
			run: withInput(replyInputSchema, async ({ refs, data, ctx, input }) => {
				const token = await readerOnly(ctx.organizationId, ctx.readerId);
				const posted = await slack(
					token,
					"chat.postMessage",
					z.object({ ts: z.string() }),
					{
						channel: refs.channel,
						thread_ts: refs.thread_ts,
						...replyParams(input),
					},
					true,
				);
				return {
					outcome: { replied: true, ts: posted.ts, channel: data.channelId },
					notice: { tone: "good", text: `Posted in ${data.channelName}` },
				};
			}),
		},
		reply_and_share: {
			label: (d) => `Reply and also send to ${d.channelName}`,
			style: "primary",
			role: "other",
			input: "Your reply, in Slack formatting",
			run: withInput(replyInputSchema, async ({ refs, data, ctx, input }) => {
				const token = await readerOnly(ctx.organizationId, ctx.readerId);
				const posted = await slack(
					token,
					"chat.postMessage",
					z.object({ ts: z.string() }),
					{
						channel: refs.channel,
						thread_ts: refs.thread_ts,
						...replyParams(input),
						reply_broadcast: "true",
					},
					true,
				);
				return {
					outcome: {
						replied: true,
						shared: true,
						ts: posted.ts,
						channel: data.channelId,
					},
					notice: { tone: "good", text: `Posted in ${data.channelName}` },
				};
			}),
		},
		invite: {
			label: (d) => `Invite to ${d.channelName}`,
			style: "secondary",
			role: "other",
			input: "A Slack user id",
			terminal: false,
			async run({ refs, data, ctx, input }) {
				if (!input || !SLACK_USER_ID.test(input)) {
					throw new CardUnavailable("error", "Name someone to invite");
				}
				const token = await readerOnly(ctx.organizationId, ctx.readerId);
				await slack(
					token,
					"conversations.invite",
					z.object({ ok: z.boolean() }),
					{ channel: refs.channel, users: input },
					true,
				);
				return {
					outcome: { invited: input },
					notice: { tone: "good", text: `Invited to ${data.channelName}` },
				};
			},
		},
		set_topic: {
			label: () => "Set the channel topic",
			style: "secondary",
			role: "other",
			input: "The new topic",
			terminal: false,
			async run({ refs, data, ctx, input }) {
				if (!input) throw new CardUnavailable("error", "A topic needs text");
				const token = await readerOnly(ctx.organizationId, ctx.readerId);
				await slack(
					token,
					"conversations.setTopic",
					z.object({ ok: z.boolean() }),
					{ channel: refs.channel, topic: input },
					true,
				);
				return {
					outcome: { topic: input },
					notice: { tone: "good", text: `Topic of ${data.channelName} set` },
				};
			},
		},
		set_presence: {
			label: () => "Set your Slack presence",
			style: "secondary",
			role: "other",
			input: "away or auto",
			terminal: false,
			async run({ ctx, input }) {
				if (input !== "away" && input !== "auto") {
					throw new CardUnavailable("error", "Presence is away or auto");
				}
				const token = await readerOnly(ctx.organizationId, ctx.readerId);
				await slack(
					token,
					"users.setPresence",
					z.object({ ok: z.boolean() }),
					{ presence: input },
					true,
				);
				return {
					outcome: { presence: input },
					notice: {
						tone: "good",
						text:
							input === "away"
								? "You are set to away"
								: "You are set to active",
					},
				};
			},
		},
		react: {
			label: () => "React",
			style: "secondary",
			role: "other",
			input: "A message ts and an emoji name, separated by a space",
			terminal: false,
			async run({ refs, ctx, input }) {
				const [ts, name, mode] = (input ?? "").split(" ");
				if (
					!ts ||
					!SLACK_TS.test(ts) ||
					!name ||
					!/^[a-z0-9_+-]{1,100}$/.test(name)
				) {
					throw new CardUnavailable("error", "Name a message and an emoji");
				}
				const token = await readerOnly(ctx.organizationId, ctx.readerId);
				await slack(
					token,
					mode === "remove" ? "reactions.remove" : "reactions.add",
					z.object({ ok: z.boolean() }),
					{ channel: refs.channel, timestamp: ts, name },
					true,
				).catch((error: unknown) => {
					// Slack answers already_reacted / no_reaction for a stale view.
					if (
						isSlack(error, "already_reacted") ||
						isSlack(error, "no_reaction")
					)
						return;
					throw error;
				});
				return { outcome: { reacted: name, ts, removed: mode === "remove" } };
			},
		},
		leave: {
			label: () => "Leave it",
			style: "secondary",
			role: "dismiss",
			async run() {
				return { outcome: { replied: false } };
			},
		},
	},
});
