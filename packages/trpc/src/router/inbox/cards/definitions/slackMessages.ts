import { z } from "zod";
import type {
	SlackBlockView,
	SlackButtonView,
	SlackInlineView,
	SlackMessageView,
	SlackPersonView,
	SlackRichElementView,
} from "../types";

/**
 * Slack's message payloads to the views the client draws. Pure, so the card
 * and the fixture harness map real payloads through the same code.
 */

const textObject = z.object({ text: z.string() }).partial();
const blockSchema = z
	.object({
		type: z.string(),
		text: textObject.optional(),
		fields: z.array(textObject).optional(),
		accessory: z
			.object({ type: z.string(), image_url: z.string().optional() })
			.partial()
			.optional(),
		elements: z
			.array(
				z
					.object({
						type: z.string(),
						text: z.union([z.string(), textObject]).optional(),
						image_url: z.string().optional(),
						alt_text: z.string().optional(),
						url: z.string().optional(),
						style: z.unknown().optional(),
					})
					.partial()
					// rich_text keeps its nested runs under each element.
					.passthrough(),
			)
			.optional(),
		image_url: z.string().optional(),
		alt_text: z.string().optional(),
		title: textObject.optional(),
	})
	.partial();
const attachmentSchema = z
	.object({
		color: z.string(),
		pretext: z.string(),
		author_name: z.string(),
		author_icon: z.string(),
		author_link: z.string(),
		title: z.string(),
		title_link: z.string(),
		text: z.string(),
		fallback: z.string(),
		fields: z.array(
			z
				.object({ title: z.string(), value: z.string(), short: z.boolean() })
				.partial(),
		),
		image_url: z.string(),
		footer: z.string(),
		footer_icon: z.string(),
		ts: z.union([z.string(), z.number()]),
		blocks: z.array(blockSchema),
		from_url: z.string(),
		original_url: z.string(),
		service_name: z.string(),
		service_icon: z.string(),
		thumb_url: z.string(),
		work_object_entity: z.record(z.string(), z.unknown()),
		actions: z.array(
			z
				.object({
					type: z.string(),
					text: z.string(),
					url: z.string(),
					style: z.string(),
				})
				.partial(),
		),
	})
	.partial();

export const messageSchema = z.object({
	ts: z.string(),
	subtype: z.string().optional(),
	attachments: z.array(attachmentSchema).optional(),
	blocks: z.array(blockSchema).optional(),
	text: z.string().optional(),
	user: z.string().optional(),
	bot_id: z.string().optional(),
	username: z.string().optional(),
	bot_profile: z
		.object({
			name: z.string().optional(),
			icons: z
				.object({
					image_48: z.string().optional(),
					image_72: z.string().optional(),
				})
				.optional(),
		})
		.optional(),
	edited: z.object({ ts: z.string().optional() }).optional(),
	reactions: z
		.array(
			z.object({
				name: z.string(),
				count: z.number(),
				users: z.array(z.string()).optional(),
			}),
		)
		.optional(),
	files: z
		.array(
			z.object({
				id: z.string(),
				name: z.string().optional(),
				title: z.string().optional(),
				permalink: z.string().optional(),
				mimetype: z.string().optional(),
				filetype: z.string().optional(),
				size: z.number().optional(),
				original_w: z.number().optional(),
				original_h: z.number().optional(),
			}),
		)
		.optional(),
});
export type SlackMessage = z.infer<typeof messageSchema>;

export const slackUser = z.object({
	id: z.string(),
	name: z.string(),
	real_name: z.string().optional(),
	is_bot: z.boolean().optional(),
	deleted: z.boolean().optional(),
	is_primary_owner: z.boolean().optional(),
	is_owner: z.boolean().optional(),
	is_admin: z.boolean().optional(),
	is_restricted: z.boolean().optional(),
	team_id: z.string().optional(),
	tz: z.string().optional(),
	profile: z
		.object({
			display_name: z.string().optional(),
			real_name: z.string().optional(),
			image_48: z.string().optional(),
			image_192: z.string().optional(),
			title: z.string().optional(),
			status_text: z.string().optional(),
			status_emoji: z.string().optional(),
			status_expiration: z.number().optional(),
		})
		.optional(),
});
export type SlackUser = z.infer<typeof slackUser>;

export function toPerson(user: SlackUser): SlackPersonView {
	const realName = user.profile?.real_name || user.real_name || null;
	const name = user.profile?.display_name || realName || user.name;
	return {
		id: user.id,
		name,
		realName: realName && realName !== name ? realName : null,
		avatar: user.profile?.image_192 ?? user.profile?.image_48 ?? null,
		isBot: user.is_bot ?? false,
		title: user.profile?.title || null,
		timezone: user.tz ?? null,
		presence: null,
		inChannel: false,
		isReader: false,
		team: null,
		role: user.is_primary_owner
			? "primary_owner"
			: user.is_owner
				? "owner"
				: user.is_admin
					? "admin"
					: null,
	};
}

const UNKNOWN_PERSON = {
	realName: null,
	title: null,
	timezone: null,
	presence: null,
	inChannel: true,
	isReader: false,
	team: null,
	role: null,
} as const;

type Raw = Record<string, unknown>;
const str = (v: unknown): string | null => (typeof v === "string" ? v : null);
const arr = (v: unknown): Raw[] =>
	Array.isArray(v)
		? (v.filter((x) => x && typeof x === "object") as Raw[])
		: [];

function inline(raw: Raw[]): SlackInlineView[] {
	const out: SlackInlineView[] = [];
	for (const e of raw) {
		const style = (
			e.style && typeof e.style === "object" ? e.style : {}
		) as Raw;
		const marks = {
			...(style.bold ? { bold: true } : {}),
			...(style.italic ? { italic: true } : {}),
			...(style.strike ? { strike: true } : {}),
			...(style.code ? { code: true } : {}),
		};
		switch (e.type) {
			case "text":
				if (str(e.text))
					out.push({ kind: "text", text: str(e.text) ?? "", ...marks });
				break;
			case "link":
				if (str(e.url))
					out.push({
						kind: "link",
						url: str(e.url) ?? "",
						text: str(e.text),
						...marks,
					});
				break;
			case "user":
				if (str(e.user_id))
					out.push({ kind: "user", id: str(e.user_id) ?? "" });
				break;
			case "channel":
				if (str(e.channel_id))
					out.push({ kind: "channel", id: str(e.channel_id) ?? "" });
				break;
			case "usergroup":
				if (str(e.usergroup_id))
					out.push({ kind: "usergroup", id: str(e.usergroup_id) ?? "" });
				break;
			case "broadcast":
				out.push({ kind: "broadcast", range: str(e.range) ?? "here" });
				break;
			case "emoji": {
				const unicode = str(e.unicode);
				out.push({
					kind: "emoji",
					name: str(e.name) ?? "",
					unicode: unicode
						? String.fromCodePoint(
								...unicode.split("-").map((h) => Number.parseInt(h, 16)),
							)
						: null,
				});
				break;
			}
			case "date":
				out.push({ kind: "date", text: str(e.fallback) ?? "" });
				break;
		}
	}
	return out;
}

/** Slack's rich_text tree, flattened to sections, lists, code and quotes. */
export function richText(elements: Raw[]): SlackRichElementView[] {
	const out: SlackRichElementView[] = [];
	for (const el of elements) {
		switch (el.type) {
			case "rich_text_section":
				out.push({ kind: "section", inline: inline(arr(el.elements)) });
				break;
			case "rich_text_preformatted":
				out.push({ kind: "preformatted", inline: inline(arr(el.elements)) });
				break;
			case "rich_text_quote":
				out.push({ kind: "quote", inline: inline(arr(el.elements)) });
				break;
			case "rich_text_list":
				out.push({
					kind: "list",
					ordered: el.style === "ordered",
					indent: typeof el.indent === "number" ? el.indent : 0,
					items: arr(el.elements).map((item) => inline(arr(item.elements))),
				});
				break;
		}
	}
	return out;
}

/** An app unfurl in Slack's work-object shape, reduced to what the card draws. */
function workObject(
	raw: Record<string, unknown> | undefined,
	url: string | undefined,
) {
	if (!raw) return null;
	const layouts = (raw.layouts ?? {}) as Raw;
	const layout = (layouts.expanded ?? layouts.condensed ?? {}) as Raw;
	const textOf = (v: unknown) => str((v as Raw | undefined)?.text);
	const title = textOf(layout.title);
	if (!title) return null;
	const icon = (layout.product_icon ?? {}) as Raw;
	const fields = arr((layout.fields as Raw | undefined)?.elements).flatMap(
		(f) => {
			const label = str(f.label);
			if (!label) return [];
			const rich = (f.rich_text ?? null) as Raw | null;
			const value = rich
				? richText(arr(rich.elements))
				: [
						{
							kind: "section" as const,
							inline: [{ kind: "text" as const, text: str(f.text) ?? "" }],
						},
					];
			return [{ label, value }];
		},
	);
	return {
		app: textOf(layout.header_title) ?? str(raw.app_name) ?? "",
		icon: viaSlack(str(icon.image_url)),
		title,
		subtitle: textOf(layout.subtitle),
		url: str(raw.external_url) ?? url ?? null,
		fields,
	};
}

export function author(
	message: SlackMessage,
	known: Map<string, SlackPersonView>,
	appUserId: string | undefined,
	appName: string,
): SlackPersonView {
	if (message.user) {
		const person = known.get(message.user);
		if (person) return person;
		if (message.user === appUserId) {
			return {
				id: message.user,
				name: appName,
				avatar: null,
				isBot: true,
				...UNKNOWN_PERSON,
			};
		}
		return {
			id: message.user,
			name: message.bot_profile?.name ?? message.username ?? message.user,
			avatar:
				message.bot_profile?.icons?.image_72 ??
				message.bot_profile?.icons?.image_48 ??
				null,
			isBot: Boolean(message.bot_profile ?? message.bot_id),
			...UNKNOWN_PERSON,
		};
	}
	return {
		id: message.bot_id ?? "app",
		name: message.bot_profile?.name ?? message.username ?? appName,
		avatar: message.bot_profile?.icons?.image_48 ?? null,
		isBot: true,
		...UNKNOWN_PERSON,
	};
}

type SlackBlock = z.infer<typeof blockSchema>;

function toBlocks(blocks: SlackBlock[] | undefined): SlackBlockView[] {
	const out: SlackBlockView[] = [];
	for (const block of blocks ?? []) {
		switch (block.type) {
			case "rich_text":
				out.push({
					type: "rich_text",
					elements: richText(
						((block as { elements?: unknown }).elements as Raw[] | undefined) ??
							[],
					),
				});
				break;
			case "header":
				if (block.text?.text)
					out.push({ type: "header", text: block.text.text });
				break;
			case "section":
				out.push({
					type: "section",
					text: block.text?.text ?? null,
					fields: (block.fields ?? []).flatMap((f) => (f.text ? [f.text] : [])),
					accessory:
						block.accessory?.type === "image"
							? viaSlack(block.accessory.image_url ?? null)
							: null,
				});
				break;
			case "context":
				out.push({
					type: "context",
					elements: (block.elements ?? []).flatMap(
						(e): Extract<SlackBlockView, { type: "context" }>["elements"] =>
							e.type === "image" && e.image_url
								? [
										{
											kind: "image" as const,
											url: viaSlack(e.image_url) ?? e.image_url,
											alt: e.alt_text ?? "",
										},
									]
								: typeof e.text === "object" && e.text.text
									? [{ kind: "text" as const, text: e.text.text }]
									: typeof e.text === "string"
										? [{ kind: "text" as const, text: e.text }]
										: [],
					),
				});
				break;
			case "divider":
				out.push({ type: "divider" });
				break;
			case "image":
				if (block.image_url)
					out.push({
						type: "image",
						url: viaSlack(block.image_url) ?? block.image_url,
						alt: block.alt_text ?? "",
						title: block.title?.text ?? null,
					});
				break;
			case "actions":
				out.push({
					type: "actions",
					buttons: (block.elements ?? []).flatMap((e) =>
						e.type === "button" && typeof e.text === "object" && e.text.text
							? [
									{
										text: e.text.text,
										url: e.url ?? null,
										style: buttonStyle(e.style),
									},
								]
							: [],
					),
				});
				break;
		}
	}
	return out;
}

const SLACK_HOSTS = /(^|\.)(slack-edge\.com|slack\.com|slack-imgs\.com)$/;

/** Many app hosts refuse to be embedded cross-origin; Slack's own client loads them through its image proxy. */
export function viaSlack(url: string | null): string | null {
	if (!url) return null;
	try {
		if (SLACK_HOSTS.test(new URL(url).hostname)) return url;
	} catch {
		return null;
	}
	return `https://slack-imgs.com/?c=1&o1=ro&url=${encodeURIComponent(url)}`;
}

function buttonStyle(style: unknown): SlackButtonView["style"] {
	return style === "primary" || style === "danger" ? style : null;
}

export interface MessageContext {
	known: Map<string, SlackPersonView>;
	appUserId: string | undefined;
	appName: string;
	readerId: string | null;
	permalinkBase: string | null;
	/** Where the client loads an image file from; null leaves files as chips. */
	fileUrl: (fileId: string) => string | null;
}

export function toMessageView(
	message: SlackMessage,
	{
		known,
		appUserId,
		appName,
		readerId,
		permalinkBase,
		fileUrl,
	}: MessageContext,
): SlackMessageView {
	return {
		ts: message.ts,
		user: author(message, known, appUserId, appName),
		deleted: message.subtype === "tombstone",
		text: message.text ?? "",
		edited: Boolean(message.edited),
		broadcast: message.subtype === "thread_broadcast",
		reactions: (message.reactions ?? []).map((r) => ({
			name: r.name,
			count: r.count,
			mine: Boolean(readerId && r.users?.includes(readerId)),
			users: r.users ?? [],
		})),
		files: (message.files ?? []).map((f) => {
			const url = f.mimetype?.startsWith("image/") ? fileUrl(f.id) : null;
			return {
				id: f.id,
				name: f.title || f.name || "file",
				permalink: f.permalink ?? null,
				type: f.filetype ?? null,
				size: f.size ?? null,
				image: url
					? { url, width: f.original_w ?? null, height: f.original_h ?? null }
					: null,
			};
		}),
		attachments: (message.attachments ?? []).map((a) => ({
			color: a.color
				? a.color.startsWith("#")
					? a.color
					: `#${a.color}`
				: null,
			pretext: a.pretext ?? null,
			author: a.author_name
				? {
						name: a.author_name,
						icon: viaSlack(a.author_icon ?? null),
						link: a.author_link ?? null,
					}
				: null,
			title: a.title ?? null,
			titleLink: a.title_link ?? null,
			text: a.text ?? (a.blocks ? null : (a.fallback ?? null)),
			fields: (a.fields ?? []).flatMap((f) =>
				f.title || f.value
					? [
							{
								title: f.title ?? "",
								value: f.value ?? "",
								short: f.short ?? false,
							},
						]
					: [],
			),
			image: viaSlack(a.image_url ?? null),
			footer: a.footer ?? null,
			footerIcon: viaSlack(
				a.footer_icon ?? (a.footer ? a.author_icon : undefined) ?? null,
			),
			ts: a.ts !== undefined ? String(a.ts) : null,
			blocks: toBlocks(a.blocks),
			unfurl: workObject(a.work_object_entity as Raw | undefined, a.from_url),
			link:
				a.from_url && !a.work_object_entity && (a.service_name || a.title)
					? {
							site: a.service_name ?? null,
							icon: viaSlack(a.service_icon ?? null),
							title: a.title ?? null,
							text: a.text ?? null,
							url: a.title_link ?? a.original_url ?? a.from_url,
							image: viaSlack(a.image_url ?? a.thumb_url ?? null),
						}
					: null,
			buttons: (a.actions ?? []).flatMap((action) =>
				action.type === "button" && action.text
					? [
							{
								text: action.text,
								url: action.url ?? null,
								style: buttonStyle(action.style),
							},
						]
					: [],
			),
		})),
		blocks: toBlocks(message.blocks),
		permalink: permalinkBase
			? `${permalinkBase}/p${message.ts.replace(".", "")}`
			: null,
	};
}
