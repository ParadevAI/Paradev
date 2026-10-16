import type { Meta, StoryObj } from "@storybook/react-vite";
import type { ComponentProps } from "react";
import { fn } from "storybook/test";
import { InboxDocument } from "./InboxDocument";

type Document = ComponentProps<typeof InboxDocument>["document"];

const text = (content: string, annotations?: { bold?: boolean }) => ({
	type: "text" as const,
	text: { content },
	...(annotations ? { annotations } : {}),
});

const unsettled = { blocks: {}, skipped: [] };

const askDocument: Document = {
	version: 1,
	answers: {},
	settled: unsettled,
	blocks: [
		{
			id: "p1",
			type: "paragraph",
			paragraph: {
				rich_text: [
					text(
						"The migration is otherwise done. Both options pass the reachability tests; they differ only in ",
					),
					text("what a crash loses", { bold: true }),
					text(" and what it costs per workspace per day."),
				],
			},
		},
		{
			id: "q",
			type: "ask",
			ask: {
				questions: [
					{
						id: "policy",
						kind: "select",
						prompt: "Which snapshot policy should sandboxes use?",
						options: [
							{
								id: "on_stop",
								label: "Snapshot on stop",
								consequence:
									"Cheapest. A crash loses everything since the last stop.",
							},
							{
								id: "every_10m",
								label: "Snapshot every 10 minutes",
								consequence:
									"About 4x the storage. A crash loses at most 10 minutes.",
							},
							{
								id: "on_commit",
								label: "Snapshot on every commit",
								consequence:
									"Unbounded on busy branches. Nothing committed is ever lost.",
							},
						],
						allow_other: true,
					},
					{
						id: "keep_old",
						kind: "confirm",
						prompt:
							"Keep the current snapshots until the new policy has run for a week?",
					},
					{
						id: "note",
						kind: "text",
						prompt: "Anything I should know before I switch it?",
						optional: true,
					},
				],
			},
		},
		{
			id: "t1",
			type: "to_do",
			to_do: {
				rich_text: [text("Migrate the 14 active sandboxes")],
				checked: true,
			},
		},
		{
			id: "t2",
			type: "to_do",
			to_do: {
				rich_text: [text("Switch the snapshot policy")],
				checked: false,
			},
		},
		{
			id: "t3",
			type: "to_do",
			to_do: { rich_text: [text("Delete the old snapshots")], checked: false },
		},
	],
};

const cardDocument: Document = {
	version: 1,
	answers: {},
	settled: unsettled,
	blocks: [
		{
			id: "p1",
			type: "paragraph",
			paragraph: {
				rich_text: [
					text(
						"Stripe shows two identical $20.00 charges 40 seconds apart on the same card. The second is a double charge; my Stripe role caps refunds at $0.",
					),
				],
			},
		},
		{
			id: "c1",
			type: "card",
			actionable: true,
			card: {
				type: "stripe.refund",
				refs: { charge: "ch_3UEgm65GN2XwxcTZ0t0eOuyk" },
			},
			resolved: {
				type: "stripe.refund",
				brand: "stripe",
				state: "ok",
				title: "Local Admin",
				subtitle: "ch_3UEgm65GN2XwxcTZ0t0eOuyk",
				status: { tone: "neutral", text: "Succeeded" },
				fields: [
					{ label: "Amount", value: "$20.00" },
					{ label: "Card", value: "Visa ···· 4242" },
					{ label: "Charged", value: "Sep 22, 2026, 7:41 PM" },
				],
				actions: [
					{
						id: "refund",
						label: "Refund $20.00 to Local Admin",
						style: "primary",
						role: "primary",
						confirm:
							"Refund $20.00 to Local Admin on ch_3UEgm65GN2XwxcTZ0t0eOuyk.",
					},
					{
						id: "skip",
						label: "Don't refund",
						style: "secondary",
						role: "dismiss",
					},
				],
			},
		},
	],
};

type CardBlockData = Extract<
	NonNullable<Document["blocks"]>[number],
	{ type: "card" }
>;

const refundCard = cardDocument.blocks?.find(
	(block): block is CardBlockData => block.type === "card",
) as CardBlockData;

const flagCard: CardBlockData = {
	id: "c2",
	type: "card",
	actionable: true,
	card: { type: "posthog.feature_flag", refs: { flag: "refund-guard" } },
	resolved: {
		type: "posthog.feature_flag",
		brand: "posthog",
		state: "ok",
		title: "refund-guard",
		subtitle: "feature flag",
		status: { tone: "neutral", text: "Off" },
		fields: [
			{ label: "Flag", value: "refund-guard", mono: true },
			{ label: "Rollout", value: "0% of users" },
		],
		actions: [
			{
				id: "enable",
				label: "Turn on for everyone",
				style: "primary",
				role: "primary",
			},
			{
				id: "rollout",
				label: "Roll out to 10%",
				style: "secondary",
				role: "other",
			},
			{
				id: "disable",
				label: "Keep it off",
				style: "secondary",
				role: "dismiss",
			},
		],
	},
};

const paragraph = (id: string, content: string) => ({
	id,
	type: "paragraph" as const,
	paragraph: { rich_text: [text(content)] },
});

const twoCards: Document = {
	version: 1,
	answers: {},
	settled: unsettled,
	blocks: [
		paragraph(
			"p1",
			"The second charge is a double charge. Refund it, then turn on the guard that stops the next one.",
		),
		refundCard,
		paragraph("p2", "The guard is behind a flag that is off today."),
		flagCard,
	],
};

const mixed: Document = {
	version: 1,
	answers: {},
	settled: unsettled,
	blocks: [
		...(twoCards.blocks ?? []),
		{
			id: "q",
			type: "ask",
			ask: {
				questions: [
					{
						id: "tell",
						kind: "confirm",
						prompt: "Email the customer that the refund is on its way?",
					},
					{
						id: "note",
						kind: "text",
						prompt: "Anything to add to that email?",
						optional: true,
					},
				],
			},
		},
		paragraph("p3", "After that I close the support ticket."),
	],
};

const refunded = {
	action: "refund",
	by: "recipient" as const,
	at: "2026-10-03T16:50:00.000Z",
	notice: "Refunded $20.00 to Local Admin",
};

const meta = {
	component: InboxDocument,
	decorators: [
		(Story) => (
			<div className="h-screen overflow-y-auto p-6">
				<div className="mx-auto max-w-2xl">
					<Story />
				</div>
			</div>
		),
	],
	args: {
		document: askDocument,
		done: false,
		pending: false,
		failure: null,
		onAnswer: fn(),
		onSkip: fn(),
		onAct: fn(),
		onConnect: fn(),
	},
} satisfies Meta<typeof InboxDocument>;

export default meta;
type Story = StoryObj<typeof meta>;

/** The spec's own example: a select with consequences, a confirm, an optional note, to-dos. The first question has focus. */
export const AskForm: Story = {};

/** The first question is answered and folded; focus is on the second. */
export const AskFormPartlyAnswered: Story = {
	args: {
		document: { ...askDocument, answers: { policy: "every_10m" } },
	},
};

export const AskFormAnswered: Story = {
	args: {
		done: true,
		document: {
			...askDocument,
			answers: {
				policy: "every_10m",
				keep_old: true,
				note: "Watch the storage bill for the first week.",
			},
		},
	},
};

/** One block: agent prose above, the integration's card below, with focus. */
export const WithIntegrationCard: Story = {
	args: { document: cardDocument },
};

/** Two card blocks: the first has focus and its buttons draw their keys. */
export const TwoCards: Story = { args: { document: twoCards } };

/** The first block is settled and folded to its outcome; focus moved to the second. */
export const TwoCardsFirstSettled: Story = {
	args: {
		document: {
			...twoCards,
			settled: { blocks: { c1: refunded }, skipped: [] },
		},
	},
};

/** Card blocks, questions and prose in one document. */
export const Mixed: Story = { args: { document: mixed } };

/** Both cards and the first question are settled; an optional question has focus. */
export const MixedLastQuestion: Story = {
	args: {
		document: {
			...mixed,
			answers: { tell: true },
			settled: {
				blocks: {
					c1: refunded,
					c2: { ...refunded, action: "enable", notice: null },
				},
				skipped: [],
			},
		},
	},
};

/** Everything is settled: each block reads as its outcome line. */
export const MixedSettled: Story = {
	args: {
		done: true,
		document: {
			...mixed,
			answers: { tell: true },
			settled: {
				blocks: {
					c1: refunded,
					c2: { ...refunded, action: "enable", notice: null },
				},
				skipped: ["note"],
			},
		},
	},
};

/** The focused block's action failed; it keeps focus. */
export const ActionFailed: Story = {
	args: {
		document: twoCards,
		failure: { blockId: "c1", message: "Stripe refused the refund." },
	},
};

/** While an action runs, every control is off. */
export const Pending: Story = { args: { document: twoCards, pending: true } };
