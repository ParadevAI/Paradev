import type { RoutedItemView } from "../../../../types";
import type { GmailDraftValue } from "../../../GmailEmailBlock";
import {
	draftInput,
	draftValue,
	type LinearDraftInput,
	type LinearDraftValue,
} from "../../../LinearDraftEditor";
import type { SlackReply } from "../../../SlackComposer";

/** What a row sends to its destination, as the reader left it. */
export type RoutedPayload =
	| ({ kind: "gmail" } & GmailDraftValue)
	| { kind: "linear"; draft: LinearDraftValue }
	| { kind: "slack"; reply: SlackReply | null };

export interface RoutedEntry {
	checked: boolean;
	/** Null for a row whose destination could not be read. */
	payload: RoutedPayload | null;
}

/** Each item's entry, by item id. */
export type RoutedValue = Record<string, RoutedEntry>;

/** One checked row as the server takes it: the item's id and exactly one destination. */
export type RoutedInput =
	| { id: string; gmail: GmailDraftValue }
	| { id: string; linear: LinearDraftInput }
	| { id: string; slack: SlackReply & { to: string } };

export interface RoutedStep {
	item: RoutedItemView;
	payload: RoutedPayload;
	/** Null while the row lacks something its destination needs. */
	input: RoutedInput | null;
}

/** A row that can still be sent: not done, and its destination can be read and written. */
export function isOpen(item: RoutedItemView): boolean {
	return !item.done && !item.unavailable && item.destination !== null;
}

function payloadOf(item: RoutedItemView): RoutedPayload | null {
	const { destination } = item;
	if (!destination) return null;
	if (destination.kind === "gmail")
		return {
			kind: "gmail",
			to: destination.to,
			subject: destination.subject,
			body: destination.body,
		};
	if (destination.kind === "linear")
		return { kind: "linear", draft: draftValue(destination.draft) };
	return {
		kind: "slack",
		reply: destination.text.trim() ? { text: destination.text } : null,
	};
}

/** Every open row checked, each with what the agent drafted. */
export function routedValue(items: RoutedItemView[]): RoutedValue {
	return Object.fromEntries(
		items.map((item) => [
			item.id,
			{ checked: isOpen(item), payload: payloadOf(item) },
		]),
	);
}

/** The value after the server sent new items: a row keeps the reader's edits while it stays open, and a row that is done or unavailable leaves the checked set. */
export function syncRouted(
	items: RoutedItemView[],
	value: RoutedValue,
): RoutedValue {
	const fresh = routedValue(items);
	return Object.fromEntries(
		items.map((item) => {
			const before = value[item.id];
			const next = fresh[item.id] as RoutedEntry;
			if (!before || !isOpen(item)) return [item.id, next];
			return [
				item.id,
				before.payload?.kind === next.payload?.kind ? before : next,
			];
		}),
	);
}

function inputOf(
	item: RoutedItemView,
	payload: RoutedPayload,
): RoutedInput | null {
	if (payload.kind === "gmail") {
		const { to, subject, body } = payload;
		if (to.length === 0 || !subject.trim() || !body.trim()) return null;
		return { id: item.id, gmail: { to, subject, body } };
	}
	if (payload.kind === "linear") {
		if (item.destination?.kind !== "linear") return null;
		const linear = draftInput(item.destination.draft, payload.draft);
		return linear && { id: item.id, linear };
	}
	if (item.destination?.kind !== "slack" || !payload.reply) return null;
	return {
		id: item.id,
		slack: { to: item.destination.target.id, ...payload.reply },
	};
}

/** The checked rows in the list's order, which is the order they are sent in. */
export function routedSteps(
	items: RoutedItemView[],
	value: RoutedValue,
): RoutedStep[] {
	return items.flatMap((item) => {
		const entry = value[item.id];
		if (!entry?.checked || !entry.payload || !isOpen(item)) return [];
		return [
			{ item, payload: entry.payload, input: inputOf(item, entry.payload) },
		];
	});
}
