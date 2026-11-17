import { appChip, splitAppLinks } from "../app-cards/app-cards.ts";
import type { ChatState } from "../chat-state/chat-state.ts";
import { linkChip } from "../link-chips/link-chips.ts";
import { mentionPill } from "../mention-candidates/mention-candidates.ts";
import { type MentionRef, splitMentions } from "../mentions/mentions.ts";
import type { Chat } from "../model/model.ts";

/**
 * Messages are markdown. Before a client's markdown renderer sees one, mention tokens and app addresses become links
 * under these schemes, so they keep their place in the flow and the renderer reports taps on them like any link.
 */
const MENTION_SCHEME = "dev-mention:";
const APP_SCHEME = "dev-app:";

const escapeLabel = (label: string) => label.replace(/[[\]\\]/g, "\\$&");
/** A label shown as written: the marks that would make emphasis, code or a link escaped, so `__init__.py` stays itself. */
const literal = (label: string) => label.replace(/[\\`*_~[\]<]/g, "\\$&");

/** `<@dev:id>` → `[@Juniper](dev-mention:dev/id)`. */
export function mentionsToLinks(
	text: string,
	label: (ref: MentionRef) => string,
): string {
	return splitMentions(text)
		.map((s) =>
			s.type === "text"
				? s.text
				: `[@${escapeLabel(label(s))}](${MENTION_SCHEME}${s.kind}/${s.id})`,
		)
		.join("");
}

/** An app's address (bare, `<…>` or a markdown link to it) → `[Gym Log](dev-app:id)`. */
export function appLinksToLinks(
	text: string,
	label: (appId: string) => string,
): string {
	return splitAppLinks(text)
		.map((s) =>
			s.type === "text"
				? s.text
				: `[${escapeLabel(label(s.appId))}](${APP_SCHEME}${s.appId})`,
		)
		.join("");
}

/** A bare web address, up to whitespace or a character that can't be part of one written in a sentence. */
const BARE_URL = /(^|[^\w<([\]/@.-])(https?:\/\/[^\s<>"'`]+)/g;
/** What a sentence puts after an address, which renderers would otherwise take as part of it: "see https://x.y." */
const TRAILING = /[.,;:!?'")\]*}]+$/;
/** Inline code and fenced code (backticks or tildes), where an address stays as written. */
const CODE = /(```[\s\S]*?```|~~~[\s\S]*?~~~|`[^`\n]*`)/;

/** An address as a sentence writes it: the sentence's own punctuation after it split off, a parenthesis it opened kept. */
function settle(url: string): [address: string, trail: string] {
	let trail = TRAILING.exec(url)?.[0] ?? "";
	let address = url.slice(0, url.length - trail.length);
	// A closing parenthesis the address opened is its own (Wikipedia's "Foo_(bar)").
	while (
		trail.startsWith(")") &&
		(address.match(/\(/g)?.length ?? 0) > (address.match(/\)/g)?.length ?? 0)
	) {
		address += ")";
		trail = trail.slice(1);
	}
	return [address, trail];
}

/**
 * Bare web addresses as `<…>` autolinks that end where the address does: a full stop, comma or closing bracket right
 * after one is the sentence's, not the address's (a parenthesis it opened stays). Renderers differ on this, so the
 * address is settled here for both apps. Code and addresses already in a link are left alone.
 */
export function bareUrlsToLinks(text: string): string {
	return text
		.split(CODE)
		.map((part, i) =>
			i % 2 === 1
				? part
				: part.replace(BARE_URL, (_, before: string, url: string) => {
						const [address, trail] = settle(url);
						return `${before}<${address}>${trail}`;
					}),
		)
		.join("");
}

const AUTOLINK = /<(https?:\/\/[^\s<>]+)>/g;

/**
 * `<https://linear.app/…/issue/SUPER-3353/…>` autolinks to known apps → `[SUPER-3353](https://…)`, so a message names
 * what it links to (the Mac draws it as the app's chip, the phone as its name). The label is escaped to read as itself;
 * code is left alone.
 */
export function linkChipsToLinks(text: string): string {
	return text
		.split(CODE)
		.map((part, i) =>
			i % 2 === 1
				? part
				: part.replace(AUTOLINK, (whole, href: string) => {
						const chip = linkChip(href);
						return chip ? `[${literal(chip.label)}](${href})` : whole;
					}),
		)
		.join("");
}

export type LinkChipSegment =
	| { type: "text"; text: string }
	| { type: "link"; href: string };

/** An autolink, or a bare address with what may stand before one (as `BARE_URL`). */
const ADDRESS =
	/<(https?:\/\/[^\s<>]+)>|(^|[^\w<([\]/@.-])(https?:\/\/[^\s<>"'`]+)/g;

/**
 * A line split at its addresses of known apps, `<…>` or bare, for a composer to draw them as chips again. Addresses end
 * where `bareUrlsToLinks` ends them, and code is left as text.
 */
export function splitLinkChips(text: string): LinkChipSegment[] {
	const out: LinkChipSegment[] = [];
	let pending = "";
	const flush = () => {
		if (pending) out.push({ type: "text", text: pending });
		pending = "";
	};
	text.split(CODE).forEach((part, i) => {
		if (i % 2 === 1) {
			pending += part;
			return;
		}
		let last = 0;
		for (const m of part.matchAll(ADDRESS)) {
			const start = m[1] ? m.index : m.index + m[2]!.length;
			const href = m[1] ?? settle(m[3]!)[0];
			if (!linkChip(href)) continue;
			pending += part.slice(last, start);
			flush();
			out.push({ type: "link", href });
			last = m[1] ? m.index + m[0].length : start + href.length;
		}
		pending += part.slice(last);
	});
	flush();
	return out;
}

/**
 * A message's markdown with its mentions named, its app addresses as the apps' names and links to known apps by what
 * they point at ("SUPER-3353"), ready to render.
 */
export function messageMarkdown(
	state: ChatState,
	chat: Chat | undefined,
	text: string,
): string {
	return linkChipsToLinks(
		appLinksToLinks(
			bareUrlsToLinks(
				mentionsToLinks(text, (ref) => mentionPill(state, chat, ref).name),
			),
			(appId) => appChip(state, appId).name,
		),
	);
}

export type LinkTarget =
	| { kind: "mention"; ref: MentionRef }
	| { kind: "app"; appId: string }
	| { kind: "url"; url: string };

/** What a link in a rendered message points at. */
export function linkTarget(url: string): LinkTarget {
	const mention = new RegExp(`^${MENTION_SCHEME}(dev|user)/(.+)$`).exec(url);
	if (mention)
		return {
			kind: "mention",
			ref: { kind: mention[1] as MentionRef["kind"], id: mention[2]! },
		};
	if (url.startsWith(APP_SCHEME))
		return { kind: "app", appId: url.slice(APP_SCHEME.length) };
	return { kind: "url", url };
}

/** Whether a URL is one of ours, which a renderer's URL sanitiser must let through. */
export const isMessageLink = (url: string) =>
	url.startsWith(MENTION_SCHEME) || url.startsWith(APP_SCHEME);

export type AppLineSegment =
	| { type: "markdown"; text: string }
	| { type: "app"; appId: string };

/**
 * Splits off lines that are nothing but an app's address (the "link at the bottom" agents add), which a client can show
 * as the app's chip on its own line; addresses inside a sentence stay in the text.
 */
export function splitAppLines(text: string): AppLineSegment[] {
	const segments: AppLineSegment[] = [];
	let prose: string[] = [];
	const flush = () => {
		if (prose.join("\n").trim())
			segments.push({ type: "markdown", text: prose.join("\n") });
		prose = [];
	};
	for (const line of text.split("\n")) {
		const parts = splitAppLinks(line).filter(
			(p) => p.type === "app" || p.text.trim(),
		);
		if (parts.length === 1 && parts[0]!.type === "app") {
			flush();
			segments.push({ type: "app", appId: parts[0]!.appId });
		} else prose.push(line);
	}
	flush();
	return segments;
}
