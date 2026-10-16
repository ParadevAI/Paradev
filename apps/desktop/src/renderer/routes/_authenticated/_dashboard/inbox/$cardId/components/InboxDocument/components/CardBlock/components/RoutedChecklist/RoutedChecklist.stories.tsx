import type { Meta, StoryObj } from "@storybook/react-vite";
import { useState } from "react";
import { expect, waitFor } from "storybook/test";
import {
	allRoutedItems,
	partlyRoutedItems,
	routedItems,
	unavailableItems,
} from "../handoffFixtures";
import { compose } from "../slackApprovalFixtures";
import { RoutedChecklist } from "./RoutedChecklist";
import { routedValue } from "./utils/routedValue";

const meta = {
	component: RoutedChecklist,
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
		items: routedItems,
		compose,
		value: routedValue(routedItems),
		onChange: () => {},
		disabled: false,
	},
	render: function Render(args) {
		const [value, setValue] = useState(() => routedValue(args.items));
		return <RoutedChecklist {...args} value={value} onChange={setValue} />;
	},
} satisfies Meta<typeof RoutedChecklist>;

export default meta;
type Story = StoryObj<typeof meta>;

const opens =
	(name: RegExp): Story["play"] =>
	async ({ canvas, userEvent }) => {
		await userEvent.click(canvas.getByRole("button", { name }));
		await waitFor(() =>
			expect(canvas.getByRole("button", { name })).toHaveAttribute(
				"aria-expanded",
				"true",
			),
		);
	};

/** Every line checked, each with where it goes. */
export const Default: Story = {};

export const GmailOpen: Story = { play: opens(/Gmail draft/) };

export const LinearOpen: Story = { play: opens(/Linear issue/) };

export const SlackOpen: Story = { play: opens(/Slack message/) };

export const Edited: Story = {
	play: async ({ canvas, userEvent }) => {
		await userEvent.click(canvas.getByRole("checkbox", { name: /Send Dana/ }));
		await userEvent.click(canvas.getByRole("button", { name: /Linear issue/ }));
		const title = await canvas.findByLabelText("Title");
		await userEvent.clear(title);
		await userEvent.type(title, "Retry the export job three times");
	},
};

/** Two of three routed: the finished lines link to what was made. */
export const PartlyRouted: Story = { args: { items: partlyRoutedItems } };

/** Gmail is not connected and the Slack conversation is gone: neither line can be checked. */
export const Unavailable: Story = { args: { items: unavailableItems } };

export const Disabled: Story = { args: { disabled: true } };

export const AllRouted: Story = { args: { items: allRoutedItems } };
