import { describe, expect, test } from "bun:test";
import {
	FILED,
	followUpDraft,
	GMAIL_DONE,
	gmailItem,
	linearItem,
	partlyRoutedItems,
	routedItems,
	slackItem,
	unavailableItems,
} from "../../../handoffFixtures";
import { team } from "../../../linearFixtures";
import { routedSteps, routedValue, syncRouted } from "./routedValue";

const ids = (items: typeof routedItems, value = routedValue(items)) =>
	routedSteps(items, value).map((step) => step.item.id);

describe("routedValue", () => {
	test("every open row starts checked with the agent's draft", () => {
		const value = routedValue(routedItems);
		expect(Object.values(value).map((entry) => entry.checked)).toEqual([
			true,
			true,
			true,
		]);
		expect(value.notes?.payload).toEqual({
			kind: "slack",
			reply: { text: "The launch moves to *October 14*." },
		});
	});

	test("done and unavailable rows start unchecked", () => {
		expect(ids(partlyRoutedItems)).toEqual(["notes"]);
		expect(ids(unavailableItems)).toEqual(["retry"]);
	});
});

describe("routedSteps", () => {
	test("gives the server's input for each row in the list's order", () => {
		expect(
			routedSteps(routedItems, routedValue(routedItems)).map(
				(step) => step.input,
			),
		).toEqual([
			{
				id: "pricing",
				gmail: {
					to: ["dana.whitfield@northwind.example"],
					subject: "Updated pricing sheet",
					body: "Hi Dana,\n\nThe updated pricing sheet is attached to the shared folder.\n\nRiley",
				},
			},
			{
				id: "retry",
				linear: {
					team: team.id,
					title: followUpDraft.title,
					description: followUpDraft.description,
					fields: followUpDraft.fields,
				},
			},
			{
				id: "notes",
				slack: { to: "C0TESTAGNT1", text: "The launch moves to *October 14*." },
			},
		]);
	});

	test("the order is the list's, not the order rows were checked in", () => {
		const reversed = [slackItem, linearItem, gmailItem];
		expect(ids(reversed)).toEqual(["notes", "retry", "pricing"]);
		const value = routedValue(routedItems);
		const rechecked = {
			notes: value.notes,
			pricing: value.pricing,
			retry: value.retry,
		} as typeof value;
		expect(ids(routedItems, rechecked)).toEqual(["pricing", "retry", "notes"]);
	});

	test("an unchecked row is left out", () => {
		const value = routedValue(routedItems);
		expect(
			ids(routedItems, {
				...value,
				retry: { ...value.retry, checked: false, payload: null },
			}),
		).toEqual(["pricing", "notes"]);
	});

	test("a row that lacks what its destination needs has no input", () => {
		const value = routedValue(routedItems);
		const steps = routedSteps(routedItems, {
			pricing: {
				checked: true,
				payload: { kind: "gmail", to: [], subject: "Hi", body: "Hi" },
			},
			retry: {
				checked: true,
				payload: {
					kind: "linear",
					draft: { title: " ", description: "", fields: {} },
				},
			},
			notes: { checked: true, payload: { kind: "slack", reply: null } },
		});
		expect(steps.map((step) => step.input)).toEqual([null, null, null]);
		expect(value.pricing?.checked).toBe(true);
	});

	test("a checked entry of a row that has since finished is ignored", () => {
		expect(ids(partlyRoutedItems, routedValue(routedItems))).toEqual(["notes"]);
	});
});

describe("syncRouted", () => {
	test("finished rows leave the checked set and open rows keep the reader's edits", () => {
		const before = routedValue(routedItems);
		const edited = {
			...before,
			notes: {
				checked: true,
				payload: { kind: "slack" as const, reply: { text: "Edited" } },
			},
		};
		const next = syncRouted(partlyRoutedItems, edited);
		expect(next.pricing?.checked).toBe(false);
		expect(next.retry?.checked).toBe(false);
		expect(next.notes).toEqual(edited.notes);
	});

	test("an unchecked open row stays unchecked", () => {
		const before = routedValue(routedItems);
		const next = syncRouted(
			[{ ...gmailItem, done: GMAIL_DONE }, linearItem, slackItem],
			{ ...before, notes: { ...before.notes, checked: false, payload: null } },
		);
		expect(next.notes?.checked).toBe(true);
		expect(
			syncRouted([{ ...linearItem, done: FILED }, slackItem], {
				...before,
				notes: {
					checked: false,
					payload: before.notes?.payload ?? null,
				},
			}).notes?.checked,
		).toBe(false);
	});
});
