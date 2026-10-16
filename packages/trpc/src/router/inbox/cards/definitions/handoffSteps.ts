import { createHmac, timingSafeEqual } from "node:crypto";
import { z } from "zod";
import { env } from "../../../../env";
import {
	type CardContext,
	CardUnavailable,
	type HandoffLandedView,
	type RunResult,
} from "../types";

export type Landed = Record<string, HandoffLandedView>;

export interface Step {
	id: string;
	/** A clause of the confirm: "file the issue in Agent Test". */
	plan: string;
	run: (
		landed: Landed,
	) => Promise<HandoffLandedView & { detail?: Record<string, unknown> }>;
}

const TEXT_MAX = 160;
const URL_MAX = 600;
const ENTRY_ROOM = TEXT_MAX + URL_MAX + 60;
const REFS_MAX = 12_000;
const DONE_MAX = 9000;

export const doneRef = z.string().max(DONE_MAX).optional();

const landedSchema = z.record(
	z.string().max(40),
	z.object({
		text: z.string().max(TEXT_MAX),
		url: z.string().startsWith("https://").max(URL_MAX).nullable(),
	}),
);

const owner = (ctx: CardContext) => ctx.card?.id ?? ctx.readerId;

const seal = (ctx: CardContext, card: string, json: string) =>
	createHmac("sha256", env.USERCONTENT_TOKEN_SECRET)
		.update(`handoff-done\n${owner(ctx)}\n${card}\n${json}`)
		.digest("base64url");

/** A card's refs are the agent's to write, so the record of what landed is signed for the inbox card and card type it belongs to; one that is not is taken as nothing done. */
export function landedOf(
	ctx: CardContext,
	card: string,
	done: string | undefined,
): Landed {
	if (!done) return {};
	const cut = done.indexOf(".");
	const signature = Buffer.from(done.slice(0, cut));
	const json = done.slice(cut + 1);
	const expected = Buffer.from(seal(ctx, card, json));
	if (
		cut < 1 ||
		signature.length !== expected.length ||
		!timingSafeEqual(signature, expected)
	)
		return {};
	const parsed = landedSchema.safeParse(JSON.parse(json));
	return parsed.success ? parsed.data : {};
}

export function sealLanded(
	ctx: CardContext,
	card: string,
	landed: Landed,
): string {
	const json = JSON.stringify(landed);
	return `${seal(ctx, card, json)}.${json}`;
}

const clip = (text: string, max: number) =>
	text.length > max ? `${text.slice(0, max - 1)}…` : text;

const sentence = (clause: string) =>
	clause.charAt(0).toUpperCase() + clause.slice(1);

/** The confirm for the steps that will run now: the reader's dialog shows this sentence and sends it back. Nothing left to do needs no confirm. */
export function planSentence(
	steps: Pick<Step, "id" | "plan">[],
	landed: Landed,
): string | undefined {
	const left = steps.filter((step) => !landed[step.id]);
	if (left.length === 0) return undefined;
	return `${sentence(left.map((step) => step.plan).join(", then "))}?`;
}

/** The record of what landed goes into the card's refs, which have a size limit; a card with no room for it offers no write. */
export function noRoom(refs: object, steps: number): string | null {
	const { done: _, ...others } = refs as { done?: string };
	return JSON.stringify(others).length + steps * ENTRY_ROOM + 200 > REFS_MAX
		? "This card is too long to keep a record of what it does. Ask the agent for a shorter one"
		: null;
}

/** Runs the steps an earlier run did not finish, in order. A step that fails stops the rest: the card stays open, keeps what landed, and says so. */
export async function runSteps(
	ctx: CardContext,
	card: string,
	steps: Step[],
	before: Landed,
): Promise<RunResult & { landed: Landed }> {
	const landed: Landed = { ...before };
	const fresh: Landed = { ...before };
	const details: Record<string, unknown> = {};
	const told = () =>
		steps.flatMap((step) => (landed[step.id] ? [landed[step.id]?.text] : []));
	for (const step of steps) {
		if (landed[step.id]) continue;
		try {
			const { detail, text, url } = await step.run(fresh);
			fresh[step.id] = { text, url };
			landed[step.id] = {
				text: clip(text, TEXT_MAX),
				url: url?.startsWith("https://") && url.length <= URL_MAX ? url : null,
			};
			if (detail) details[step.id] = detail;
		} catch (error) {
			if (!(error instanceof CardUnavailable))
				console.error(`[inbox/handoff] step ${step.id} failed`, error);
			if (told().length === 0) throw error;
			const reason =
				error instanceof CardUnavailable ? error.text : "It did not answer";
			return {
				landed,
				terminal: false,
				outcome: { landed, steps: details, failed: step.id },
				refs: { done: sealLanded(ctx, card, landed) },
				notice: {
					tone: "warn",
					text: `${told().join(". ")}. Not done: ${step.plan} (${reason})`,
				},
			};
		}
	}
	return {
		landed,
		outcome: { landed, steps: details },
		refs: { done: sealLanded(ctx, card, landed) },
		notice: { tone: "good", text: told().join(". ") },
	};
}
