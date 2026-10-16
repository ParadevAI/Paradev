import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, fn, waitFor } from "storybook/test";
import {
	allRoutedItems,
	followUpsActions,
	followUpsView,
	partlyRoutedActions,
	partlyRoutedView,
	unavailableItems,
} from "../handoffFixtures";
import { off } from "../slackApprovalFixtures";
import { HandoffFollowUpsBlock } from "./HandoffFollowUpsBlock";

const meta = {
	component: HandoffFollowUpsBlock,
	decorators: [
		(Story) => (
			<div className="-m-6 h-screen overflow-y-auto p-6">
				<div className="mx-auto max-w-2xl overflow-hidden rounded-lg border border-border bg-card">
					<Story />
				</div>
			</div>
		),
	],
	args: {
		view: followUpsView,
		actions: followUpsActions,
		done: false,
		pending: false,
		failure: null,
		onAct: fn(),
	},
} satisfies Meta<typeof HandoffFollowUpsBlock>;

export default meta;
type Story = StoryObj<typeof meta>;

const clicks =
	(name: string | RegExp): Story["play"] =>
	async ({ canvas, userEvent }) => {
		const button = canvas.getByRole("button", { name });
		await waitFor(() => expect(button).toBeEnabled());
		await userEvent.click(button);
	};

/** Three action items, one for each destination. */
export const Default: Story = {};

/** The question lists every write in the list's order. */
export const Confirming: Story = { play: clicks("Route 3 items") };

export const Edited: Story = {
	play: async ({ canvas, userEvent }) => {
		await userEvent.click(canvas.getByRole("checkbox", { name: /Send Dana/ }));
		await userEvent.click(canvas.getByRole("button", { name: /Linear issue/ }));
		const title = await canvas.findByLabelText("Title");
		await userEvent.clear(title);
		await userEvent.type(title, "Retry the export job three times");
	},
};

/** Two of three routed: the card stays open for the one that failed. */
export const PartlyRouted: Story = {
	args: {
		view: partlyRoutedView,
		actions: partlyRoutedActions,
		failure: "Slack did not answer. Try again",
	},
};

export const UnavailableRows: Story = {
	args: { view: { ...followUpsView, items: unavailableItems } },
};

export const NothingChecked: Story = {
	play: async ({ canvas, userEvent }) => {
		for (const box of canvas.getAllByRole("checkbox"))
			await userEvent.click(box);
	},
};

export const DisabledWithReason: Story = {
	args: {
		actions: off(followUpsActions, "route", "Linear is not connected"),
	},
};

/** Notes with no link and no time. */
export const PlainNotes: Story = {
	args: {
		view: {
			...followUpsView,
			source: "notes",
			meeting: { title: "Hallway chat", url: null, heldAt: null },
		},
	},
};

export const Pending: Story = { args: { pending: true } };

export const Done: Story = {
	args: { view: { ...followUpsView, items: allRoutedItems }, done: true },
};
