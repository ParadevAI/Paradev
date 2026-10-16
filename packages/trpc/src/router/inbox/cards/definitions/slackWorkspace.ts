import { z } from "zod";
import { userConnection } from "../../../../lib/connectors/lookup";
import { connectionAccessToken } from "../../../../lib/connectors/refresh";
import { decryptSecret } from "../../../plugins/crypto";
import { CardUnavailable } from "../types";
import { slackBots } from "./slackBots";
import { type SlackUser, slackUser } from "./slackMessages";

export const CONNECT = { label: "Connect Slack", href: "#/plugins/slack" };
export const SLACK_ID = /^[A-Z0-9]{6,20}$/;
export const SLACK_TS = /^\d{6,16}\.\d{3,9}$/;
const PEOPLE_LOOKUPS_MAX = 40;
const PRESENCE_LOOKUPS_MAX = 15;
const EMOJI_TTL_MS = 10 * 60_000;
const DIRECTORY_TTL_MS = 10 * 60_000;
const DIRECTORY_MAX = 1000;
export const MEMBERS_MAX = 500;
const TEAM_LOOKUPS_MAX = 10;
const CHANNELS_MAX = 1000;

const SIGNED_OUT = new Set([
	"not_authed",
	"invalid_auth",
	"token_revoked",
	"token_expired",
	"account_inactive",
]);

const SLACK_SAYS: Record<string, string> = {
	name_taken: "A channel with that name exists already",
	invalid_name_specials:
		"Channel names can’t contain spaces or punctuation. Use dashes to separate words",
	invalid_name_punctuation: "A channel name needs letters or numbers",
	invalid_name_maxlength: "Channel names can be 80 characters at most",
	invalid_name_required: "A channel needs a name",
	restricted_action: "Your Slack role does not allow this",
	restricted_action_read_only_channel: "That channel is read-only for you",
	user_is_restricted: "Your Slack role does not allow this",
	user_is_ultra_restricted: "Your Slack role does not allow this",
	no_permission: "Your Slack role does not allow this",
	already_in_channel: "They are in the channel already",
	cant_invite_self: "You are in the channel already",
	cant_invite: "Slack does not allow adding that person to the channel",
	user_not_found: "Slack does not have that person",
	users_not_found: "Slack does not have one of those people",
	ura_max_channels: "A guest on that list cannot join more channels",
	is_archived: "That channel is archived",
	time_in_past: "That time has passed",
	time_too_far: "Slack schedules messages up to 120 days ahead",
	msg_too_long: "That message is too long for Slack",
	too_long: "That is too long for Slack",
	invalid_blocks: "Slack could not read that message's formatting",
	cannot_parse: "Slack could not read that time",
	cannot_dm_bot: "Slack does not deliver direct messages to that app",
	not_allowed_token_type: "Slack does not allow this for an app",
	method_not_supported_for_channel_type:
		"Slack does not allow this in that kind of conversation",
	profile_status_set_failed_not_valid_emoji: "Slack does not have that emoji",
	file_not_found: "Slack no longer has that file",
	canvas_editing_failed: "Slack could not change that canvas",
	canvas_not_found: "Slack no longer has that canvas",
	canvas_disabled_user_team: "Canvases are off in this Slack workspace",
	invalid_email: "Slack did not accept that email address",
	not_paid: "This Slack plan does not include that",
	free_team_not_allowed: "This Slack plan does not include that",
	ratelimited: "Slack is limiting requests. Try again in a minute",
};

const NO_ANSWER = "Slack did not answer. Look in Slack before you try again";
const NO_ANSWER_READ = "Slack did not answer. Try again";
const WRITES_BY_GET = new Set(["dnd.setSnooze"]);

/** Carries Slack's own code, so a caller decides on the code and not on the wording. */
export class SlackError extends CardUnavailable {
	constructor(
		state: CardUnavailable["state"],
		text: string,
		readonly code: string | undefined,
		connect?: CardUnavailable["connect"],
	) {
		super(state, text, connect);
	}
}

export const isSlack = (error: unknown, code: string): boolean =>
	error instanceof SlackError && error.code === code;

/** The same Slack code means a different thing for the organization's app than for a person's own account. */
function refusal(code: string | undefined, status: number, asPerson: boolean) {
	if (code === "channel_not_found" || code === "thread_not_found")
		return new SlackError(
			"gone",
			asPerson
				? "That Slack conversation is not one you can see"
				: "That Slack thread is not one the Superset app can see",
			code,
		);
	if (code === "not_in_channel")
		return new SlackError(
			"no_access",
			asPerson
				? "You are not in that Slack channel"
				: "Add the Superset app to that channel to see this thread",
			code,
		);
	if (code === "missing_scope")
		return new SlackError(
			"no_access",
			"Slack needs a newer permission for this. Connect Slack again",
			code,
			CONNECT,
		);
	if (code && SIGNED_OUT.has(code))
		return new SlackError(
			"no_connector",
			"Slack no longer accepts this connection. Connect Slack again",
			code,
			CONNECT,
		);
	if (!code && status === 429)
		return new SlackError("error", SLACK_SAYS.ratelimited ?? "", "ratelimited");
	return new SlackError(
		"error",
		(code && SLACK_SAYS[code]) ?? "Slack could not do that",
		code,
	);
}

export async function slack<T>(
	token: string,
	method: string,
	schema: z.ZodType<T>,
	params: Record<string, unknown>,
	post = false,
): Promise<T> {
	const url = new URL(`https://slack.com/api/${method}`);
	const response = await fetch(
		post
			? url
			: `${url}?${new URLSearchParams(params as Record<string, string>)}`,
		{
			method: post ? "POST" : "GET",
			headers: {
				authorization: `Bearer ${token}`,
				...(post ? { "content-type": "application/json; charset=utf-8" } : {}),
			},
			body: post ? JSON.stringify(params) : undefined,
			signal: AbortSignal.timeout(10_000),
		},
	).catch(() => {
		throw new SlackError(
			"error",
			post || WRITES_BY_GET.has(method) ? NO_ANSWER : NO_ANSWER_READ,
			undefined,
		);
	});
	const body: unknown = await response.json().catch(() => null);
	const envelope = z
		.object({ ok: z.boolean(), error: z.string().optional() })
		.safeParse(body);
	if (!envelope.success || !envelope.data.ok) {
		const code = envelope.success ? envelope.data.error : undefined;
		if (code && !SLACK_SAYS[code])
			console.warn(`[inbox/slack] ${method} answered ${code}`);
		throw refusal(code, response.status, token.includes("xoxp-"));
	}
	const parsed = schema.safeParse(body);
	if (!parsed.success) {
		throw new SlackError(
			"error",
			"Slack answered in a shape this card does not know",
			undefined,
		);
	}
	return parsed.data;
}

/** The bot of whichever connected workspace can see the channel. */
export async function botFor(
	organizationId: string,
	channel: string,
): Promise<{ teamId: string; token: string }> {
	const bots = [...(await slackBots(organizationId))];
	if (bots.length === 0) {
		throw new CardUnavailable(
			"no_connector",
			"Connect Slack for this organization to see this thread",
			CONNECT,
		);
	}
	if (bots.length > 1) {
		for (const [teamId, token] of bots) {
			const sees = await slack(token, "conversations.info", z.object({}), {
				channel,
			}).then(
				() => true,
				() => false,
			);
			if (sees) return { teamId, token };
		}
	}
	const [teamId, token] = bots[0] as [string, string];
	return { teamId, token };
}

/**
 * The reader's own Slack token, when they connected Slack themselves. A
 * connection made through the connector flow carries the person's user
 * token beside the bot token; one carried over from the old integration
 * holds only the bot token and says so with no `slack_user_id`.
 */
export async function readerToken(
	organizationId: string,
	readerId: string,
): Promise<{ token: string; slackUserId: string } | null> {
	const connection = await userConnection(organizationId, "slack", readerId);
	const config = connection?.config as { slack_user_id?: string | null } | null;
	if (!connection || !config?.slack_user_id) return null;
	return {
		token: await connectionAccessToken(connection),
		slackUserId: await decryptSecret(config.slack_user_id),
	};
}

export async function readerOnly(organizationId: string, readerId: string) {
	const reader = await readerToken(organizationId, readerId);
	if (!reader) {
		throw new CardUnavailable(
			"no_access",
			"Connect your Slack account to reply and react as you",
		);
	}
	return reader.token;
}

export const SLACK_USER_ID = /^[UW][A-Z0-9]{6,20}$/;

const MAX_BLOCKS_JSON = 40_000;

export const replyInputSchema = z.union([
	z
		.string()
		.trim()
		.min(1)
		.transform((text) => ({ text, blocks: undefined })),
	z.object({
		text: z.string().trim().min(1),
		blocks: z
			.array(
				z.looseObject({
					type: z.literal("rich_text"),
					elements: z.array(z.unknown()),
				}),
			)
			.max(1)
			.optional(),
	}),
]);

export function replyParams(
	reply: z.infer<typeof replyInputSchema>,
): Record<string, string> {
	if (!reply.blocks) return { text: reply.text };
	const blocks = JSON.stringify(reply.blocks);
	if (blocks.length > MAX_BLOCKS_JSON)
		throw new CardUnavailable("error", "That reply is too long for Slack");
	return { text: reply.text, blocks };
}

/**
 * Everyone in the workspace, so the mention picker can offer people outside
 * the channel the way Slack does. Paged once per token and kept for a while;
 * people from other organizations are never in it and are looked up singly.
 */
const directoryCache = new Map<string, { at: number; users: SlackUser[] }>();

export async function workspaceDirectory(token: string): Promise<SlackUser[]> {
	const cached = directoryCache.get(token);
	if (cached && Date.now() - cached.at < DIRECTORY_TTL_MS) return cached.users;
	const users: SlackUser[] = [];
	let cursor: string | undefined;
	try {
		do {
			const page = await slack(
				token,
				"users.list",
				z.object({
					members: z.array(slackUser),
					response_metadata: z
						.object({ next_cursor: z.string().optional() })
						.optional(),
				}),
				{ limit: "200", ...(cursor ? { cursor } : {}) },
			);
			users.push(...page.members.filter((u) => !u.deleted));
			cursor = page.response_metadata?.next_cursor || undefined;
		} while (cursor && users.length < DIRECTORY_MAX);
	} catch {
		return cached?.users ?? [];
	}
	directoryCache.set(token, { at: Date.now(), users });
	return users;
}

export async function lookUpPeople(
	token: string,
	ids: string[],
): Promise<SlackUser[]> {
	const found = await Promise.all(
		ids.slice(0, PEOPLE_LOOKUPS_MAX).map((id) =>
			slack(token, "users.info", z.object({ user: slackUser }), {
				user: id,
			})
				.then((r) => r.user)
				.catch(() => null),
		),
	);
	return found.filter((u): u is SlackUser => u !== null);
}

const teamCache = new Map<string, { name: string; icon: string | null }>();

/** Names and icons of the other organizations people in this channel belong to. */
export async function teams(
	token: string,
	ids: string[],
): Promise<Map<string, { name: string; icon: string | null }>> {
	const found = new Map<string, { name: string; icon: string | null }>();
	await Promise.all(
		ids.slice(0, TEAM_LOOKUPS_MAX).map(async (id) => {
			const cached = teamCache.get(id);
			if (cached) {
				found.set(id, cached);
				return;
			}
			const info = await slack(
				token,
				"team.info",
				z.object({
					team: z.object({
						name: z.string(),
						icon: z.object({ image_44: z.string().optional() }).optional(),
					}),
				}),
				{ team: id },
			).catch(() => null);
			if (!info) return;
			const team = {
				name: info.team.name,
				icon: info.team.icon?.image_44 ?? null,
			};
			teamCache.set(id, team);
			found.set(id, team);
		}),
	);
	return found;
}

const channelCache = new Map<
	string,
	{ at: number; channels: Record<string, string> }
>();

/** Public channels by id, for the `#` picker; cached like the people directory. */
export async function channelDirectory(
	token: string,
): Promise<Record<string, string>> {
	const cached = channelCache.get(token);
	if (cached && Date.now() - cached.at < DIRECTORY_TTL_MS)
		return cached.channels;
	const channels: Record<string, string> = {};
	let cursor: string | undefined;
	try {
		do {
			const page = await slack(
				token,
				"conversations.list",
				z.object({
					channels: z.array(z.object({ id: z.string(), name: z.string() })),
					response_metadata: z
						.object({ next_cursor: z.string().optional() })
						.optional(),
				}),
				{
					types: "public_channel",
					exclude_archived: "true",
					limit: "200",
					...(cursor ? { cursor } : {}),
				},
			);
			for (const c of page.channels) channels[c.id] = c.name;
			cursor = page.response_metadata?.next_cursor || undefined;
		} while (cursor && Object.keys(channels).length < CHANNELS_MAX);
	} catch {
		return cached?.channels ?? {};
	}
	channelCache.set(token, { at: Date.now(), channels });
	return channels;
}

const groupCache = new Map<
	string,
	{ at: number; groups: Record<string, string> }
>();

/** User groups by id to their handle; needs `usergroups:read`, so an older install gets none. */
export async function userGroups(
	token: string,
): Promise<Record<string, string>> {
	const cached = groupCache.get(token);
	if (cached && Date.now() - cached.at < DIRECTORY_TTL_MS) return cached.groups;
	const listed = await slack(
		token,
		"usergroups.list",
		z.object({
			usergroups: z.array(z.object({ id: z.string(), handle: z.string() })),
		}),
		{},
	).catch(() => null);
	const groups = Object.fromEntries(
		(listed?.usergroups ?? []).map((g) => [g.id, g.handle]),
	);
	groupCache.set(token, { at: Date.now(), groups });
	return groups;
}

/**
 * The emoji catalogue changes rarely and is the same for every thread in a
 * workspace, so one fetch serves every card for a while. Aliases are
 * flattened to the image they point at; aliases of standard emoji are
 * dropped, the client already knows those.
 */
const emojiCache = new Map<
	string,
	{ at: number; emoji: Record<string, string> }
>();

export async function customEmoji(
	token: string,
): Promise<Record<string, string>> {
	const cached = emojiCache.get(token);
	if (cached && Date.now() - cached.at < EMOJI_TTL_MS) return cached.emoji;
	const listed = await slack(
		token,
		"emoji.list",
		z.object({ emoji: z.record(z.string(), z.string()) }),
		{},
	).catch(() => null);
	const raw = listed?.emoji ?? {};
	const emoji: Record<string, string> = {};
	for (const [name, value] of Object.entries(raw)) {
		if (!value.startsWith("alias:")) emoji[name] = value;
	}
	for (const [name, value] of Object.entries(raw)) {
		if (!value.startsWith("alias:")) continue;
		const target = emoji[value.slice("alias:".length)];
		if (target) emoji[name] = target;
	}
	emojiCache.set(token, { at: Date.now(), emoji });
	return emoji;
}

/**
 * Presence is one call per person and rate-limited, so only the first few
 * people get a dot; everyone else shows none rather than a stale one.
 */
export async function presenceOf(
	token: string,
	ids: string[],
): Promise<Map<string, "active" | "away">> {
	const found = new Map<string, "active" | "away">();
	await Promise.all(
		ids.slice(0, PRESENCE_LOOKUPS_MAX).map(async (id) => {
			const result = await slack(
				token,
				"users.getPresence",
				z.object({ presence: z.enum(["active", "away"]) }),
				{ user: id },
			).catch(() => null);
			if (result) found.set(id, result.presence);
		}),
	);
	return found;
}
