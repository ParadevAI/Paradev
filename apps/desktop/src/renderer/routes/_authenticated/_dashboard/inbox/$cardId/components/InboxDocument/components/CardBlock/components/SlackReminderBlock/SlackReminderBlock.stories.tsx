import type { Meta, StoryObj } from "@storybook/react-vite";
import { fn } from "storybook/test";
import { reminderActions, reminderView } from "../slackApprovalFixtures";
import { SlackReminderBlock } from "./SlackReminderBlock";

const meta = {
	component: SlackReminderBlock,
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
		view: reminderView,
		actions: reminderActions,
		done: false,
		pending: false,
		failure: null,
		onAct: fn(),
	},
} satisfies Meta<typeof SlackReminderBlock>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const TimePicker: Story = {
	play: async ({ canvas, userEvent }) => {
		await userEvent.click(
			canvas.getByRole("button", { name: "Reminder time" }),
		);
	},
};

/** A time that has passed: the fields are marked and the button is off. */
export const PastTime: Story = {
	args: {
		view: {
			...reminderView,
			time: new Date(Date.now() - 3_600_000).toISOString(),
		},
	},
};

/** The agent's time had passed when the card was read: the fields open on tomorrow morning. */
export const ProposedTimePassed: Story = {
	args: { view: { ...reminderView, time: null, stale: true } },
};

export const Resolved: Story = { args: { done: true } };

export const Pending: Story = { args: { pending: true } };

export const Failure: Story = {
	args: { failure: "Slack reminds up to 5 years ahead" },
};
