import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, fn, waitFor } from "storybook/test";
import {
	bugDoneView,
	bugFiledActions,
	bugFiledView,
	bugNoSlackView,
	bugNotInChannelView,
	bugReportActions,
	bugReportView,
} from "../handoffFixtures";
import { off } from "../slackApprovalFixtures";
import { HandoffBugReportBlock } from "./HandoffBugReportBlock";

const meta = {
	component: HandoffBugReportBlock,
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
		view: bugReportView,
		actions: bugReportActions,
		done: false,
		pending: false,
		failure: null,
		onAct: fn(),
		onConnect: fn(),
	},
} satisfies Meta<typeof HandoffBugReportBlock>;

export default meta;
type Story = StoryObj<typeof meta>;

const clicks =
	(name: string | RegExp): Story["play"] =>
	async ({ canvas, userEvent }) => {
		const button = canvas.getByRole("button", { name });
		await waitFor(() => expect(button).toBeEnabled());
		await userEvent.click(button);
	};

/** The thread, the drafted issue and the reply that carries its link back. */
export const Default: Story = {};

/** The question names both writes in order. */
export const Confirming: Story = { play: clicks("File issue") };

export const Edited: Story = {
	play: async ({ canvas, userEvent }) => {
		const title = canvas.getByLabelText("Title");
		await userEvent.clear(title);
		await userEvent.type(title, "Safari sign-in loop");
		await userEvent.click(
			canvas.getByRole("checkbox", { name: "Reply in thread" }),
		);
	},
};

/** An earlier run filed the issue and the reply failed: only the reply is left. */
export const FiledNotReplied: Story = {
	args: { view: bugFiledView, actions: bugFiledActions },
};

export const FiledConfirming: Story = {
	args: FiledNotReplied.args,
	play: clicks("Reply with the link"),
};

/** The reader's own Slack account is not connected: the issue can still be filed. */
export const SlackNotConnected: Story = { args: { view: bugNoSlackView } };

export const NotInChannel: Story = { args: { view: bugNotInChannelView } };

export const DisabledWithReason: Story = {
	args: {
		actions: off(bugReportActions, "file", "Linear is not connected"),
	},
};

export const Pending: Story = { args: { pending: true } };

export const Failed: Story = {
	args: {
		view: bugFiledView,
		actions: bugFiledActions,
		failure: "Slack did not answer. Try again",
	},
};

export const Done: Story = { args: { view: bugDoneView, done: true } };

/** Dismissed before anything was filed. */
export const DoneNotFiled: Story = { args: { done: true } };
