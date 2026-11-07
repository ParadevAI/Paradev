import { parseSlackLink } from "@superset/shared/slack-links";
import type { PluginTarget, TargetRequest } from "../proxy";
import { FIRST_PARTY_SERVERS } from "../servers";
import type { SlackMessage, SlackUser } from "../servers/slack/tools";

export type SlackLinkPreview =
	| { status: "ready"; title: string | null; description: string | null }
	| { status: "unavailable" };

export type SlackLinkPreviewDeps = {
	resolveTarget(request: TargetRequest): Promise<PluginTarget>;
	slackApi(
		token: string,
		method: string,
		params: Record<string, unknown>,
		httpMethod: "GET",
	): Promise<Record<string, unknown>>;
};

const UNAVAILABLE: SlackLinkPreview = { status: "unavailable" };
const MAX_DESCRIPTION = 300;

function plainText(markup: string): string {
	const text = markup
		.replace(/<([^<>|]+)\|([^<>]+)>/g, "$2")
		.replace(/<(https?:[^<>]+)>/g, "$1")
		.replace(/&lt;/g, "<")
		.replace(/&gt;/g, ">")
		.replace(/&amp;/g, "&")
		.replace(/\s+/g, " ")
		.trim();
	return text.length > MAX_DESCRIPTION
		? `${text.slice(0, MAX_DESCRIPTION - 1).trimEnd()}…`
		: text;
}

function messageText(message: SlackMessage): string {
	const attachments = (message.attachments ?? [])
		.map((attachment) => attachment.title ?? attachment.fallback ?? "")
		.filter(Boolean)
		.join(" | ");
	return plainText([message.text, attachments].filter(Boolean).join(" "));
}

/** The token of the user's own connection to Superset's hosted Slack server. */
function slackToken(target: PluginTarget): string | null {
	if (
		target.kind !== "first-party" ||
		target.build !== FIRST_PARTY_SERVERS.slack
	) {
		return null;
	}
	return target.build.credential(target.secrets) || null;
}

/**
 * What a Slack link points at, read from Slack's API with the viewer's own
 * Slack connection: a message's author and text, or a person's name and
 * title. Anything short of one ready connection and a found message reads as
 * unavailable.
 */
export async function loadSlackLinkPreview(
	deps: SlackLinkPreviewDeps,
	request: { href: string; userId: string; organizationId: string | null },
): Promise<SlackLinkPreview> {
	const link = parseSlackLink(request.href);
	if (!link) return UNAVAILABLE;
	let token: string | null;
	try {
		token = slackToken(
			await deps.resolveTarget({
				userId: request.userId,
				organizationId: request.organizationId,
				plugin: "slack",
			}),
		);
	} catch {
		return UNAVAILABLE;
	}
	if (!token) return UNAVAILABLE;
	const api = (method: string, params: Record<string, unknown>) =>
		deps.slackApi(token, method, params, "GET").catch(() => null);
	const userInfo = async (user: string) =>
		((await api("users.info", { user }))?.user as SlackUser | undefined) ??
		null;

	if (link.kind === "user") {
		const user = await userInfo(link.user);
		if (!user) return UNAVAILABLE;
		return {
			status: "ready",
			title: user.real_name || user.name || null,
			description: user.profile?.title || null,
		};
	}
	const page = await api(
		link.threadTs ? "conversations.replies" : "conversations.history",
		{
			channel: link.channel,
			...(link.threadTs ? { ts: link.threadTs } : { limit: 1 }),
			oldest: link.ts,
			latest: link.ts,
			inclusive: true,
		},
	);
	const message = ((page?.messages as SlackMessage[] | undefined) ?? []).find(
		(candidate) => candidate.ts === link.ts,
	);
	if (!message) return UNAVAILABLE;
	const author = message.user
		? await userInfo(message.user).then(
				(user) => user?.real_name || user?.name || null,
			)
		: (message.username ?? null);
	return {
		status: "ready",
		title: author,
		description: messageText(message) || null,
	};
}

type SlackPreviewRequest = Parameters<typeof loadSlackLinkPreview>[1];

const READY_FOR_MS = 5 * 60_000;
const UNAVAILABLE_FOR_MS = 30_000;
const MAX_CACHED = 500;

/**
 * The preview loader with a per-user cache: hover cards share Slack's rate
 * limit with the agents' Slack tools, so the same link is read once a while.
 */
export function createSlackLinkPreviewLoader(
	deps: SlackLinkPreviewDeps,
	now: () => number = Date.now,
): (request: SlackPreviewRequest) => Promise<SlackLinkPreview> {
	const cache = new Map<
		string,
		{ expiresAt: number; value: SlackLinkPreview }
	>();
	return async (request) => {
		const key = `${request.userId}\n${request.href}`;
		const cached = cache.get(key);
		if (cached && cached.expiresAt > now()) return cached.value;
		const value = await loadSlackLinkPreview(deps, request);
		cache.delete(key);
		cache.set(key, {
			value,
			expiresAt:
				now() + (value.status === "ready" ? READY_FOR_MS : UNAVAILABLE_FOR_MS),
		});
		const oldest = cache.keys().next().value;
		if (cache.size > MAX_CACHED && oldest !== undefined) cache.delete(oldest);
		return value;
	};
}
