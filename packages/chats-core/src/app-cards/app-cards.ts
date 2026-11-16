import { type ChatState, myApps } from "../chat-state/chat-state.ts";
import { chatTitle, directDev, mentionableDevs } from "../devs/devs.ts";
import { formatListTime } from "../format-list-time/format-list-time.ts";
import { lastMatch } from "../last-match/last-match.ts";
import type { App, Chat, Dev, Message } from "../model/model.ts";

/**
 * People see apps as cards and chips, never as URLs. Agents still paste an app's address now and then (and older
 * messages have them), so these find app-host URLs in message text: `<id>.localhost:<port>` locally,
 * `<id>.devusercontent.com` in production and `<id>.preview.devusercontent.com` on previews.
 */
const UUID = "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}";
const APP_URL = `https?://(${UUID})\\.(?:localhost(?::\\d+)?|(?:[a-z0-9-]+\\.)*devusercontent\\.com)(?:[/?#][^\\s<>()\\[\\]]*)?`;
/** A markdown link to an app, an autolink (`<url>`) or a bare URL. */
const linkPattern = () =>
	new RegExp(
		`\\[[^\\]\\n]*\\]\\((${APP_URL})\\)|<(${APP_URL})>|(${APP_URL})`,
		"gi",
	);
/** Sentence punctuation right after a bare URL belongs to the sentence. */
const TRAILING = /[.,;:!?'"]+$/;

export type AppLinkSegment =
	| { type: "text"; text: string }
	| { type: "app"; appId: string; url: string };

/** The app an app-host URL serves, or null for any other URL. */
export function appIdFromUrl(url: string): string | null {
	const match = new RegExp(`^${APP_URL}$`, "i").exec(url.trim());
	return match ? match[1]!.toLowerCase() : null;
}

/** Splits text into plain runs and app links, which clients draw as chips that open the app. */
export function splitAppLinks(text: string): AppLinkSegment[] {
	const segments: AppLinkSegment[] = [];
	const push = (s: string) => {
		if (!s) return;
		const last = segments.at(-1);
		if (last?.type === "text") last.text += s;
		else segments.push({ type: "text", text: s });
	};
	let last = 0;
	for (const match of text.matchAll(linkPattern())) {
		push(text.slice(last, match.index));
		const markdown = match[1] ?? match[3];
		if (markdown) {
			segments.push({
				type: "app",
				appId: (match[2] ?? match[4])!.toLowerCase(),
				url: markdown,
			});
			last = match.index + match[0].length;
			continue;
		}
		const url = match[5]!.replace(TRAILING, "");
		segments.push({ type: "app", appId: match[6]!.toLowerCase(), url });
		last = match.index + url.length;
	}
	push(text.slice(last));
	return segments;
}

/** What an app chip shows: the app if this user can see it, else a neutral "Sketch". */
export function appChip(
	state: ChatState,
	appId: string,
): { app: App | undefined; name: string } {
	const app = state.apps.find((a) => a.id === appId);
	return { app, name: app?.name ?? "Sketch" };
}

/**
 * Where a version's picture is: what the chat shows in place of the live sketch, in the viewer's theme (the server
 * falls back to light). Null for a draft, or when the current version has none; an older version is asked for anyway.
 */
export function sketchPicture(
	app: App,
	version: number,
	theme: "light" | "dark",
): string | null {
	if (!app.url) return null;
	if (version === app.version?.number && !app.version.preview) return null;
	return `${new URL(app.url).origin}/_dev/picture/${version}/${theme}`;
}

/** Pictures are rendered this wide (CSS px); a sketch's height is given at this width. */
export const SKETCH_PICTURE_WIDTH = 640;
/** The height the runner's sketch tool draws at when it isn't told one. */
export const SKETCH_DEFAULT_HEIGHT = 420;

/**
 * The picture's size for a card announcing `version`, so the card holds its space before the picture loads. Only the
 * current version's size is known.
 */
export function sketchPictureSize(
	app: App,
	version: number,
): { width: number; height: number } | null {
	return version === app.version?.number ? (app.version.preview ?? null) : null;
}

/** What a `sketch` call has said so far; while the model is still writing it, the title may not be there yet. */
export function sketchCall(input: unknown): {
	title: string | null;
	width: number;
	height: number;
} {
	const given = (input ?? {}) as { title?: unknown; height?: unknown };
	const title =
		typeof given.title === "string" && given.title.trim()
			? given.title.trim()
			: null;
	const height =
		typeof given.height === "number" && given.height > 0
			? given.height
			: SKETCH_DEFAULT_HEIGHT;
	return { title, width: SKETCH_PICTURE_WIDTH, height };
}

/** The link "Copy link" gives: the app's origin, which always serves its current version (`url` pins one). */
export function appLink(app: App): string | null {
	return app.url ? `${new URL(app.url).origin}/` : null;
}

/** The Dev that last published the app (its newest card), if a Dev did. */
export function appMaker(state: ChatState, appId: string): Dev | undefined {
	const card = lastMatch(
		state.messages,
		(m) => m.appId === appId && m.authorDevId,
	);
	return card?.authorDevId ? state.devs[card.authorDevId] : undefined;
}

/**
 * Who "Ask … to change it" asks (a mention): the app's maker while one can mention it in the chat, else the chat's own
 * Dev. In a group that's the group's own Dev.
 */
export function appChangeDev(
	state: ChatState,
	chat: Chat,
	appId: string,
): Dev | undefined {
	const mentionable = mentionableDevs(state, chat);
	const maker = appMaker(state, appId);
	if (maker && mentionable.some((m) => m.id === maker.id)) return maker;
	return directDev(state, chat) ?? mentionable[0];
}

/** "just now", "5 min ago", "3 hr ago", then the sidebar's time or date. */
export function timeAgo(at: Date, now: Date): string {
	const minutes = Math.floor((now.getTime() - at.getTime()) / 60_000);
	if (minutes < 1) return "just now";
	if (minutes < 60) return `${minutes} min ago`;
	if (minutes < 6 * 60) return `${Math.floor(minutes / 60)} hr ago`;
	return formatListTime(at, now);
}

/**
 * A card's line under the app's name: the version it announced, when, and the version on show if it has moved on:
 * "v1 · published just now", "v3 · updated 5 min ago", "v2 · updated Oct 3 · now v4".
 */
export function appCardMeta(
	app: App,
	card: Pick<Message, "appVersion" | "at">,
	now: Date,
): string {
	const current = app.version?.number;
	const announced = card.appVersion ?? current;
	if (!announced) return "Draft";
	const verb = !app.saved
		? "sketched"
		: announced === 1
			? "published"
			: "updated";
	// A share re-posts the current version: say when that version was published, not when it was shared.
	const at =
		announced === current && app.version ? app.version.createdAt : card.at;
	const parts = [`v${announced}`, `${verb} ${timeAgo(new Date(at), now)}`];
	if (current && current > announced) parts.push(`now v${current}`);
	return parts.join(" · ");
}

/** When a sketch last changed: its latest version's publish, else when it was drawn. */
export const sketchChangedAt = (app: App) =>
	app.version?.createdAt ?? app.createdAt;

/**
 * Your saved sketches across your chats (with `"all"`, every sketch they hold, saved or not), the last changed first,
 * narrowed to the ones whose name or chat has every word of `query` (any case): the Mac's My sketches and the phone's
 * All sketches.
 */
export function findSketches(
	state: ChatState,
	query: string,
	scope: "saved" | "all" = "saved",
): App[] {
	const words = query.toLowerCase().split(/\s+/).filter(Boolean);
	const titles = new Map(
		state.chats.map((c) => [c.id, chatTitle(state, c).toLowerCase()]),
	);
	const mine = new Set(
		state.chats
			.filter((c) => c.memberIds.includes(state.meId))
			.map((c) => c.id),
	);
	return (
		scope === "saved"
			? myApps(state)
			: state.apps.filter((a) => mine.has(a.chatId))
	)
		.filter((app) => {
			const haystack = `${app.name.toLowerCase()} ${titles.get(app.chatId) ?? ""}`;
			return words.every((w) => haystack.includes(w));
		})
		.sort((a, b) => sketchChangedAt(b).localeCompare(sketchChangedAt(a)));
}
