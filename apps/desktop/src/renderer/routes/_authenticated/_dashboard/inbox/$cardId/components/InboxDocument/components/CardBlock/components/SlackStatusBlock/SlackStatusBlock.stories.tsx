import type { Meta, StoryObj } from "@storybook/react-vite";
import { fn } from "storybook/test";
import {
	clearStatusAction,
	pauseActions,
	pausedView,
	pauseView,
	resumeAction,
	statusActions,
	statusForeverView,
	statusView,
	statusWithCurrentView,
} from "../slackApprovalFixtures";
import { SlackStatusBlock } from "./SlackStatusBlock";

const meta = {
	component: SlackStatusBlock,
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
		view: statusView,
		actions: statusActions,
		done: false,
		pending: false,
		failure: null,
		onAct: fn(),
	},
} satisfies Meta<typeof SlackStatusBlock>;

export default meta;
type Story = StoryObj<typeof meta>;

const clicks =
	(name: string): Story["play"] =>
	async ({ canvas, userEvent }) => {
		await userEvent.click(canvas.getByRole("button", { name }));
	};

/** A status with an end time of the agent's own, and notifications paused until then. */
export const Status: Story = {};

export const StatusConfirming: Story = { play: clicks("Set status") };

export const StatusEmojiPicker: Story = { play: clicks("Status emoji") };

/** A workspace emoji and no end: the pause is off, as in Slack. */
export const StatusNoEnd: Story = { args: { view: statusForeverView } };

/** A status is set now: it shows above the form, and the server offers to clear it. */
export const StatusWithCurrent: Story = {
	args: {
		view: statusWithCurrentView,
		actions: [...statusActions, clearStatusAction],
	},
};

export const StatusClearConfirming: Story = {
	args: StatusWithCurrent.args,
	play: clicks("Clear status"),
};

export const StatusPastEnd: Story = {
	args: {
		view: {
			...statusView,
			proposed: {
				...statusView.proposed,
				until: new Date(Date.now() - 3_600_000).toISOString(),
			},
		},
	},
};

export const StatusResolved: Story = { args: { done: true } };

const pauseArgs = { view: pauseView, actions: pauseActions };

export const Pause: Story = { args: pauseArgs };

export const PauseConfirming: Story = {
	args: pauseArgs,
	play: clicks("Pause notifications"),
};

/** Notifications are paused now: the server offers to resume them. */
export const PauseWithCurrent: Story = {
	args: { view: pausedView, actions: [...pauseActions, resumeAction] },
};

export const PauseResumeConfirming: Story = {
	args: PauseWithCurrent.args,
	play: clicks("Resume notifications"),
};

export const PauseResolved: Story = { args: { ...pauseArgs, done: true } };

export const Pending: Story = { args: { pending: true } };

export const Failure: Story = {
	args: { failure: "Pick a time within a year" },
};
