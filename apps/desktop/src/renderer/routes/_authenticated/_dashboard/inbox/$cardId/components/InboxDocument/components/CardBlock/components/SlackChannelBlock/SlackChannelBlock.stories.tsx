import type { Meta, StoryObj } from "@storybook/react-vite";
import { fireEvent, fn } from "storybook/test";
import {
	APP_NOT_IN_CHANNEL,
	connectActions,
	connectView,
	createActions,
	createView,
	inviteActions,
	inviteNobodyView,
	invitePrivateView,
	inviteView,
	off,
} from "../slackApprovalFixtures";
import { SlackChannelBlock } from "./SlackChannelBlock";

const meta = {
	component: SlackChannelBlock,
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
		view: inviteView,
		actions: inviteActions,
		done: false,
		pending: false,
		failure: null,
		onAct: fn(),
	},
} satisfies Meta<typeof SlackChannelBlock>;

export default meta;
type Story = StoryObj<typeof meta>;

const clicks =
	(name: string): Story["play"] =>
	async ({ canvas, userEvent }) => {
		await userEvent.click(canvas.getByRole("button", { name }));
	};

/** Add people to a channel: a guest is marked, and someone already in it is left out. */
export const Invite: Story = {};

export const InviteConfirming: Story = { play: clicks("Add") };

export const InvitePicker: Story = { play: clicks("Add people") };

/** A private channel that another organization shares. */
export const InvitePrivateExternal: Story = {
	args: { view: invitePrivateView },
};

/** Everyone proposed is in the channel already: nothing to add. */
export const InviteNobodyLeft: Story = { args: { view: inviteNobodyView } };

/** Hover "Add" for the reason. */
export const InviteArchived: Story = {
	args: { actions: off(inviteActions, "invite", "That channel is archived") },
};

export const InviteResolved: Story = { args: { done: true } };

export const Create: Story = {
	args: { view: createView, actions: createActions },
};

export const CreateConfirming: Story = {
	args: Create.args,
	play: clicks("Create"),
};

/** A name Slack refuses: the rule shows and the button is off. */
export const CreateInvalidName: Story = {
	args: {
		view: { ...createView, proposed: { name: "Launch 1.33!", private: true } },
		actions: createActions,
	},
};

export const CreatePublicEmpty: Story = {
	args: {
		view: {
			...createView,
			proposed: { name: "", private: false },
			invitees: [],
		},
		actions: createActions,
	},
};

export const CreateResolved: Story = {
	args: { ...Create.args, done: true },
};

/** A Slack Connect invitation to people of another organization. */
export const Connect: Story = {
	args: { view: connectView, actions: connectActions },
};

export const ConnectConfirming: Story = {
	args: Connect.args,
	play: clicks("Send invitation"),
};

export const ConnectInvalidAddress: Story = {
	args: Connect.args,
	play: async ({ canvas }) => {
		const input = canvas.getByLabelText("Email address");
		await fireEvent.change(input, { target: { value: "eli@northwind" } });
		await fireEvent.keyDown(input, { key: "Enter" });
	},
};

/** The app is not in the channel: hover "Send invitation" for the reason. */
export const ConnectAppNotInChannel: Story = {
	args: {
		view: { ...connectView, appInChannel: false },
		actions: off(connectActions, "connect", APP_NOT_IN_CHANNEL),
	},
};

export const ConnectResolved: Story = {
	args: { ...Connect.args, done: true },
};

export const Pending: Story = { args: { ...Create.args, pending: true } };

export const Failure: Story = {
	args: {
		...Create.args,
		failure:
			"Created #launch-133. People were not added: Slack did not answer. Try again to finish",
	},
};
