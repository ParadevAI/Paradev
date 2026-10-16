import { z } from "zod";
import {
	type CardContext,
	type CardField,
	CardUnavailable,
	CHANGED_SINCE_CONFIRM,
	defineCard,
	type HandoffFollowUpsView,
	type RoutedItemView,
	type SlackComposeContextView,
	type SlackConversationView,
	withInput,
} from "../types";
import { createDraft, draftsAs } from "./gmailNewDraft";
import {
	doneRef,
	type Landed,
	landedOf,
	noRoom,
	planSentence,
	runSteps,
	type Step,
	sealLanded,
} from "./handoffSteps";
import { linearFor } from "./linearClient";
import {
	draftInput,
	draftRefs,
	fileDraft,
	type LoadedDraft,
	loadDraft,
} from "./linearDraft";
import {
	groupsMentioned,
	mentionsEveryone,
	messageBody,
	slackPost,
	TO,
} from "./slackPost";

interface Refs {
	source: "granola" | "circleback" | "notes";
	meeting: string;
	meeting_url?: string;
	held_at?: string;
	items: string;
	done?: string;
}

const ITEMS_MAX = 8;
const ITEMS_REF_MAX = 6000;
const TEXT_MAX = 300;
const BODY_MAX = 1500;
const RECIPIENTS_MAX = 10;

const recipients = z.array(z.email().max(200)).min(1).max(RECIPIENTS_MAX);

const itemSchema = z.object({
	id: z.string().regex(/^[a-z0-9_-]{1,24}$/),
	text: z.string().min(1).max(TEXT_MAX),
	owner: z.string().max(80).optional(),
	to: z.discriminatedUnion("kind", [
		z.object({
			kind: z.literal("gmail"),
			to: recipients,
			subject: z.string().max(200),
			body: z.string().max(BODY_MAX),
		}),
		z.object({
			kind: z.literal("linear"),
			...draftRefs,
			description: z.string().max(BODY_MAX).optional(),
		}),
		z.object({
			kind: z.literal("slack"),
			to: z.string().regex(TO),
			text: z.string().max(BODY_MAX),
		}),
	]),
});
type Item = z.infer<typeof itemSchema>;

const itemsSchema = z
	.array(itemSchema)
	.min(1)
	.max(ITEMS_MAX)
	.refine(
		(items) => new Set(items.map((item) => item.id)).size === items.length,
		"Two items have the same id",
	);

interface Loaded {
	item: Item;
	view: RoutedItemView;
	draft?: LoadedDraft;
	compose?: SlackComposeContextView;
}

interface Data {
	items: Loaded[];
	landed: Landed;
	noRoom: string | null;
}

const routeInput = z.object({
	items: z
		.array(
			z.object({
				id: z.string().max(24),
				gmail: z
					.object({
						to: recipients,
						subject: z.string().trim().min(1).max(200),
						body: z.string().trim().min(1).max(BODY_MAX),
					})
					.optional(),
				linear: draftInput.optional(),
				slack: messageBody
					.extend({
						/** `target.id` from the view: the place the reader saw. */
						to: z.string().regex(TO),
					})
					.optional(),
			}),
		)
		.min(1)
		.max(ITEMS_MAX),
});
type RouteInput = z.infer<typeof routeInput>;

const placeName = (target: SlackConversationView) =>
	target.kind === "channel" || target.kind === "private"
		? `#${target.name}`
		: target.name;

async function load(
	item: Item,
	meeting: string,
	from: string | null,
	landed: Landed,
	ctx: CardContext,
): Promise<Loaded> {
	const base = {
		id: item.id,
		text: item.text,
		owner: item.owner ?? null,
		done: landed[item.id] ?? null,
	};
	const { to } = item;
	try {
		if (to.kind === "gmail")
			return {
				item,
				view: {
					...base,
					destination: { ...to, from },
					unavailable: from ? null : "Connect Gmail to make this draft",
					plan: "make a Gmail draft to {to}",
				},
			};
		if (to.kind === "linear") {
			const draft = await loadDraft(linearFor(ctx), to, {
				title: item.text.slice(0, 250),
				description: `From the meeting "${meeting}".`,
			});
			return {
				item,
				draft,
				view: {
					...base,
					destination: { kind: "linear", draft: draft.view },
					unavailable: null,
					plan: `file "{title}" in ${draft.team.name}`,
				},
			};
		}
		const shown = await slackPost.resolve({ to: to.to, draft: to.text }, ctx);
		if (shown.state !== "ok" || shown.view?.kind !== "slack.message")
			throw new CardUnavailable(
				"error",
				shown.notice?.text ?? "Slack did not give this conversation",
			);
		const { target } = shown.view;
		if (!target) throw new CardUnavailable("gone", "That conversation is gone");
		const blocked = shown.actions.find(
			(action) => action.id === "send",
		)?.disabled;
		return {
			item,
			compose: shown.view.compose,
			view: {
				...base,
				destination: {
					kind: "slack",
					target,
					recipients: shown.view.recipients,
					text: to.text,
				},
				unavailable: blocked ? String(blocked) : null,
				plan: `send a Slack message to ${placeName(target)}`,
			},
		};
	} catch (error) {
		if (!(error instanceof CardUnavailable))
			console.error(`[inbox/handoff] item ${item.id} did not load`, error);
		return {
			item,
			view: {
				...base,
				destination: null,
				unavailable:
					error instanceof CardUnavailable
						? error.text
						: "This destination could not be read",
				plan: "",
			},
		};
	}
}

function step(
	loaded: Loaded,
	chosen: RouteInput["items"][number],
	ctx: CardContext,
): Step {
	const { item, view, draft } = loaded;
	const { to } = item;
	if (view.unavailable)
		throw new CardUnavailable(
			"error",
			`"${item.text}" cannot be routed: ${view.unavailable}`,
		);
	if (to.kind === "gmail") {
		const mail = chosen.gmail;
		if (!mail) throw new CardUnavailable("error", CHANGED_SINCE_CONFIRM);
		const names = mail.to.join(", ");
		return {
			id: item.id,
			plan: `make a Gmail draft to ${names}`,
			run: async () => {
				const made = await createDraft(ctx, {
					to: mail.to,
					subject: mail.subject,
					text: mail.body,
				});
				return {
					text: `Made a Gmail draft to ${names}`,
					url: made.url,
					detail: { draft: made.id },
				};
			},
		};
	}
	if (to.kind === "linear") {
		const issue = chosen.linear;
		if (!draft || !issue || issue.team !== draft.team.id)
			throw new CardUnavailable("error", CHANGED_SINCE_CONFIRM);
		return {
			id: item.id,
			plan: `file "${issue.title}" in ${draft.team.name}`,
			run: async () => {
				const filed = await fileDraft(
					linearFor(ctx),
					ctx,
					draft,
					issue,
					`follow-up ${item.id}`,
				);
				return {
					text: `Filed ${filed.identifier} in ${draft.team.name}`,
					url: filed.url,
					detail: { issue: filed },
				};
			},
		};
	}
	const message = chosen.slack;
	const target =
		view.destination?.kind === "slack" ? view.destination.target : null;
	if (!message || !target || message.to !== target.id)
		throw new CardUnavailable("error", CHANGED_SINCE_CONFIRM);
	if (mentionsEveryone(message) || groupsMentioned(message).length)
		throw new CardUnavailable(
			"error",
			`"${item.text}" notifies a whole channel or group. Send an announcement from its own card`,
		);
	return {
		id: item.id,
		plan: `send a Slack message to ${placeName(target)}`,
		run: async () => {
			const sent = await slackPost.act(
				{ to: to.to, draft: to.text },
				"send",
				ctx,
				message,
			);
			return {
				text: sent.result.notice?.text ?? `Sent to ${placeName(target)}`,
				url: null,
				detail: sent.result.outcome,
			};
		},
	};
}

function steps(data: Data, input: RouteInput, ctx: CardContext): Step[] {
	const seen = new Set<string>();
	return input.items.flatMap((chosen) => {
		const loaded = data.items.find((each) => each.item.id === chosen.id);
		if (!loaded)
			throw new CardUnavailable(
				"error",
				"An item on this list is not one the card has",
			);
		if (seen.has(chosen.id) || data.landed[chosen.id]) return [];
		seen.add(chosen.id);
		return [step(loaded, chosen, ctx)];
	});
}

const TYPE = "handoff.follow_ups";

export const handoffFollowUps = defineCard<Refs, Data>({
	type: TYPE,
	label: "Meeting follow-ups",
	ask: "Route follow-ups",
	brand: "superset",
	refs: z.object({
		/** Where the agent says the notes came from; the card does not check it. */
		source: z.enum(["granola", "circleback", "notes"]),
		meeting: z.string().trim().min(1).max(200),
		meeting_url: z.string().startsWith("https://").max(500).optional(),
		held_at: z.string().datetime({ offset: true }).optional(),
		/** JSON, 6000 characters in all: up to eight items, each `{ id, text, owner?, to }` where `to` is `{kind:"gmail",to,subject,body}`, `{kind:"linear",team,title?,description?,…}` or `{kind:"slack",to,text}`. */
		items: z.string().max(ITEMS_REF_MAX),
		done: doneRef,
	}),
	async resolve({ refs, ctx }) {
		let raw: unknown;
		try {
			raw = JSON.parse(refs.items);
		} catch {
			throw new CardUnavailable("error", "The follow-ups are not JSON");
		}
		const parsed = itemsSchema.safeParse(raw);
		if (!parsed.success) {
			const [issue] = parsed.error.issues;
			throw new CardUnavailable(
				"error",
				`The agent passed follow-ups this card cannot read (${issue?.path.join(".")}: ${issue?.message})`,
			);
		}
		const landed = landedOf(ctx, TYPE, refs.done);
		const from = parsed.data.some((item) => item.to.kind === "gmail")
			? await draftsAs(ctx)
			: null;
		const items = await Promise.all(
			parsed.data.map((item) => load(item, refs.meeting, from, landed, ctx)),
		);
		const view: HandoffFollowUpsView = {
			kind: "handoff.follow_ups",
			source: refs.source,
			meeting: {
				title: refs.meeting,
				url: refs.meeting_url ?? null,
				heldAt: refs.held_at ?? null,
			},
			items: items.map((each) => each.view),
			compose: items.find((each) => each.compose)?.compose ?? null,
		};
		const routed = items.filter((each) => each.view.done).length;
		const fields: CardField[] = [
			{ label: "Meeting", value: refs.meeting, href: refs.meeting_url },
			{ label: "Follow-ups", value: String(items.length) },
			...(routed ? [{ label: "Routed", value: String(routed) }] : []),
		];
		return {
			title: refs.meeting,
			subtitle: `${items.length} follow-ups`,
			status: routed
				? { tone: "warn", text: `${routed} of ${items.length} routed` }
				: undefined,
			fields,
			view,
			data: { items, landed, noRoom: noRoom(refs, items.length) },
		};
	},
	actions: {
		route: {
			label: () => "Route checked items",
			style: "primary",
			role: "primary",
			available: (data) => data.noRoom ?? true,
			confirmFor: (data, raw, ctx) => {
				const input = routeInput.safeParse(raw);
				return input.success
					? planSentence(steps(data, input.data, ctx), data.landed)
					: "";
			},
			run: withInput(routeInput, async ({ data, ctx, input }) => {
				const chosen = steps(data, input, ctx);
				if (chosen.length === 0)
					throw new CardUnavailable("error", "Those items are routed already");
				const { landed, ...ran } = await runSteps(
					ctx,
					TYPE,
					chosen,
					data.landed,
				);
				const left = data.items.filter((each) => !landed[each.item.id]).length;
				if (ran.terminal === false || left === 0) return ran;
				return {
					...ran,
					terminal: false,
					refs: { done: sealLanded(ctx, TYPE, landed) },
					notice: {
						tone: "good",
						text: `${ran.notice?.text ?? ""}. ${left} left`,
					},
				};
			}),
		},
		dismiss: {
			label: (data) =>
				Object.keys(data.landed).length ? "Done" : "Route nothing",
			style: "secondary",
			role: "dismiss",
			async run({ data }) {
				return { outcome: { landed: data.landed } };
			},
		},
	},
});
