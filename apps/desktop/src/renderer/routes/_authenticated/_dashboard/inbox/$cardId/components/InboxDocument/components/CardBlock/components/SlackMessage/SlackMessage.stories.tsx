import type { Meta, StoryObj } from "@storybook/react-vite";
import { fn } from "storybook/test";
import { SlackWorkspaceProvider } from "../../providers/SlackWorkspaceProvider";
import { messages, workspace } from "../SlackThreadBlock/fixtures";
import { SlackMessage } from "./SlackMessage";

const meta = {
	component: SlackMessage,
	decorators: [
		(Story) => (
			<div className="mx-auto max-w-2xl rounded-lg border border-border bg-card py-6">
				<SlackWorkspaceProvider {...workspace}>
					<Story />
				</SlackWorkspaceProvider>
			</div>
		),
	],
	args: {
		message: messages.question,
		now: new Date(),
		onReact: fn(),
	},
} satisfies Meta<typeof SlackMessage>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Hover it: quick reactions, the picker, copy link and open in Slack. */
export const WithReactions: Story = {};

export const MentionAndLink: Story = {
	args: { message: messages.reply },
};

/** The same person moments later: no avatar or name, the time on hover. */
export const Grouped: Story = {
	args: { message: messages.followUp, compact: true },
};

export const LinkPills: Story = {
	args: { message: messages.links },
};

export const Formatted: Story = {
	args: { message: messages.formatted },
};

/** An app's pull-request attachment: colored bar, title, fields, footer. */
export const AppAttachment: Story = {
	args: { message: messages.pullRequest },
};

export const AlsoSentToTheChannel: Story = {
	args: { message: messages.merged },
};

/** No Slack account of the reader's own: reactions show but cannot be toggled. */
export const ReadOnly: Story = {
	args: { onReact: undefined },
};
