import type { AgentMessage } from "@superset/chat/protocol";
import type { TranscriptCardRef } from "renderer/routes/_authenticated/_dashboard/v2-workspace/$workspaceId/hooks/usePaneRegistry/components/ChatSession/providers/TranscriptCardsProvider";

const ITEM = /^\s{0,3}(\d+)[.)]\s+(.+?)\s*$/;
const ASKS =
	/\b(which (one|of these|option|do you (want|prefer))|one of these|pick one|choose|prefer|options?|your call|questions? for you|decide|decision)\b/i;
const MIN_OPTIONS = 2;
const MAX_OPTIONS = 6;
const LABEL_MAX = 80;

/**
 * The choices the coordinator's reply offers, when it asks the person to pick
 * one from a numbered list. A list of open questions is not a choice, and a
 * list the reply merely reports is not either.
 */
export function decisionCardsFromMessage(
	message: AgentMessage,
): TranscriptCardRef[] {
	const decision = parseDecision(message.text);
	if (!decision) return [];
	return [
		{
			kind: "decision",
			key: `decision:${message.id}`,
			messageId: message.id,
			options: decision.options.map((option) => option.label),
			details: decision.options.map((option) => option.detail),
			intro: decision.intro,
		},
	];
}

export function decisionOptions(text: string): string[] {
	return parseDecision(text)?.options.map((option) => option.label) ?? [];
}

export interface Decision {
	/** The reply up to the list: the question and what led to it. */
	intro: string;
	options: { label: string; detail: string | null }[];
}

/** The choice a reply offers, split into what it asks and the options to pick from; null when it offers none. */
export function parseDecision(text: string): Decision | null {
	const lines = text.split("\n");
	const items: { number: number; text: string; at: number }[] = [];
	for (const [at, line] of lines.entries()) {
		const item = ITEM.exec(line);
		if (item?.[1] && item[2]) {
			items.push({ number: Number(item[1]), text: item[2], at });
		}
	}
	if (items.length < MIN_OPTIONS || items.length > MAX_OPTIONS) return null;
	if (!items.every((item, index) => item.number === index + 1)) return null;
	const first = items[0];
	const last = items.at(-1);
	if (!first || !last) return null;
	const before = lines.slice(0, first.at).reverse().find(nonEmpty);
	const after = lines.slice(last.at + 1).find(nonEmpty);
	if (!(before && asksBefore(before)) && !(after && asksAfter(after))) {
		return null;
	}
	const options = items.map((item) => ({
		label: optionLabel(item.text),
		detail: optionDetail(item.text),
	}));
	const labels = options.map((option) => option.label);
	if (labels.some((label) => !label || label.endsWith("?"))) return null;
	if (new Set(labels).size !== labels.length) return null;
	return { intro: lines.slice(0, first.at).join("\n").trim(), options };
}

/** What follows the option's title, as the row's second line; null when the title is all of it. */
function optionDetail(item: string): string | null {
	const bold = /^\*\*(.+?)\*\*\s*(.*)$/.exec(item);
	if (bold) {
		const rest = (bold[2] ?? "").replace(/^[\s:–-]+/, "").trim();
		return rest || null;
	}
	const plain = item.replace(/[*_`]/g, "").replace(/\s+/g, " ").trim();
	const sentence = /^(.+?[.!?:])(?:\s+)(.+)$/.exec(plain);
	return sentence?.[2]?.trim() || null;
}

function nonEmpty(line: string): boolean {
	return line.trim().length > 0;
}

const SHORT_ASK_WORDS = 3;

const QUESTION_SENTENCE = /\?(?:\s|$)/;

/** A question that introduces the list makes it a choice, even with a sentence after it. */
function asksBefore(line: string): boolean {
	return QUESTION_SENTENCE.test(line.trim()) || ASKS.test(line);
}

/**
 * After the list, only a choice in so many words counts: "Which one?" does,
 * "Want me to continue?" after a list of what was done does not.
 */
function asksAfter(line: string): boolean {
	const trimmed = line.trim();
	return (
		ASKS.test(trimmed) ||
		(trimmed.endsWith("?") && trimmed.split(/\s+/).length <= SHORT_ASK_WORDS)
	);
}

/** The option's title: its bold lead if it has one, else its first sentence. */
function optionLabel(item: string): string {
	const bold = /^\*\*(.+?)\*\*/.exec(item);
	const raw = bold?.[1] ?? item;
	const plain = raw.replace(/[*_`]/g, "").replace(/\s+/g, " ").trim();
	const sentence = /^(.+?[.!?:])(?:\s|$)/.exec(plain);
	const label = (sentence?.[1] ?? plain).replace(/[.:!]$/, "").trim();
	return label.length > LABEL_MAX
		? `${label.slice(0, LABEL_MAX - 1).trimEnd()}…`
		: label;
}
