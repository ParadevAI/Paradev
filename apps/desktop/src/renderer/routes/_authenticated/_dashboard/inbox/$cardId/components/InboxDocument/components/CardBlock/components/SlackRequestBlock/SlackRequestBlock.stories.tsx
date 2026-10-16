import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, fn, waitFor } from "storybook/test";
import {
	OWN_BUTTONS,
	off,
	requestActions,
	requestGuestView,
	requestMemberView,
	requestOwnButtonsView,
	requestReplyOnlyView,
	requestView,
} from "../slackApprovalFixtures";
import { SlackRequestBlock } from "./SlackRequestBlock";

const meta = {
	component: SlackRequestBlock,
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
		view: requestView,
		actions: requestActions,
		done: false,
		pending: false,
		failure: null,
		onAct: fn(),
	},
} satisfies Meta<typeof SlackRequestBlock>;

export default meta;
type Story = StoryObj<typeof meta>;

const deny: Story["play"] = async ({ canvas, userEvent }) => {
	await userEvent.click(canvas.getByRole("radio", { name: "Deny" }));
};

const answers =
	(name: string): Story["play"] =>
	async (context) => {
		if (name === "Deny") await deny(context);
		const button = context.canvas.getByRole("button", { name });
		await waitFor(() => expect(button).toBeEnabled());
		await context.userEvent.click(button);
	};

/** Someone asks to get into a private channel: approving adds them and replies. */
export const Default: Story = {};

export const ApproveConfirming: Story = { play: answers("Approve") };

/** The other answer has its own drafted reply. */
export const Deny: Story = { play: deny };

export const DenyConfirming: Story = { play: answers("Deny") };

/** A guest from another organization, into a channel that is shared. */
export const GuestAndExternal: Story = { args: { view: requestGuestView } };

/** The person is in the channel already: approving only replies. */
export const AlreadyMember: Story = { args: { view: requestMemberView } };

export const AlreadyMemberConfirming: Story = {
	args: AlreadyMember.args,
	play: answers("Approve"),
};

/** A request that adds nobody anywhere: the reply is the whole answer. */
export const ReplyOnly: Story = { args: { view: requestReplyOnlyView } };

/** A workflow's own buttons: only Slack can press them, so the way there stands out. Hover the buttons for the reason. */
export const OwnButtons: Story = {
	args: {
		view: requestOwnButtonsView,
		actions: off(
			off(requestActions, "approve", OWN_BUTTONS),
			"deny",
			OWN_BUTTONS,
		),
	},
};

export const Resolved: Story = { args: { done: true } };

export const Pending: Story = { args: { pending: true } };

export const Failure: Story = {
	args: {
		failure:
			"Added Casey Nguyen to #leadership. The reply was not sent: Slack did not answer",
	},
};
