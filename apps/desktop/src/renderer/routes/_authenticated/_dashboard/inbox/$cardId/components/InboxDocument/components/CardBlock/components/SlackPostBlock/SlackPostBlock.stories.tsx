import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, fn, waitFor } from "storybook/test";
import {
	broadcastPostView,
	dmPostView,
	externalPostView,
	groupMentionPostView,
	groupPostView,
	off,
	postActions,
	postView,
	privatePostView,
	scheduledPostView,
	stalePostView,
} from "../slackApprovalFixtures";
import { SlackPostBlock } from "./SlackPostBlock";

const meta = {
	component: SlackPostBlock,
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
		view: postView,
		actions: postActions,
		done: false,
		pending: false,
		failure: null,
		onAct: fn(),
	},
} satisfies Meta<typeof SlackPostBlock>;

export default meta;
type Story = StoryObj<typeof meta>;

const clicks =
	(name: string | RegExp): Story["play"] =>
	async ({ canvas, userEvent }) => {
		const button = canvas.getByRole("button", { name });
		await waitFor(() => expect(button).toBeEnabled());
		await userEvent.click(button);
	};

/** A message to a channel, sent now: no dialog, as in Slack. */
export const Default: Story = {};

/** `@channel` in the draft: the send asks first, with the number Slack's own warning shows. */
export const Broadcast: Story = { args: { view: broadcastPostView } };

export const BroadcastConfirming: Story = {
	args: Broadcast.args,
	play: clicks("Send"),
};

/** A user group in the draft: the question names the group and its size. */
export const GroupMentionConfirming: Story = {
	args: { view: groupMentionPostView },
	play: clicks("Send"),
};

/** The agent proposes a time: the fields open on it and the button says so. */
export const Scheduled: Story = { args: { view: scheduledPostView } };

export const ScheduledBroadcastConfirming: Story = {
	args: { view: { ...broadcastPostView, postAt: scheduledPostView.postAt } },
	play: clicks(/^Schedule for (?!later)/),
};

export const ScheduleMenu: Story = { play: clicks("Schedule for later") };

/** Type to filter channels and people; arrows and Enter take one. */
export const TargetPicker: Story = { play: clicks("Change") };

export const DirectMessage: Story = { args: { view: dmPostView } };

/** Each person can be taken out; the picker adds one. */
export const GroupMessage: Story = { args: { view: groupPostView } };

export const PrivateChannel: Story = { args: { view: privatePostView } };

/** A channel shared with another organization. */
export const ExternalChannel: Story = { args: { view: externalPostView } };

export const ProposedTimePassed: Story = { args: { view: stalePostView } };

export const Empty: Story = { args: { view: { ...postView, draft: "" } } };

/** Hover "Send" for the reason. */
export const ArchivedChannel: Story = {
	args: { actions: off(postActions, "send", "That channel is archived") },
};

export const Resolved: Story = { args: { done: true } };

export const Pending: Story = { args: { pending: true } };

export const Failure: Story = {
	args: {
		failure:
			"This notifies 3 people in #test-agents. Read it again before you send",
	},
};
