import type { Meta, StoryObj } from "@storybook/react-vite";
import { fn } from "storybook/test";
import { customEmoji, draft, people } from "../SlackThreadBlock/fixtures";
import { SlackComposer } from "./SlackComposer";

const meta = {
	component: SlackComposer,
	decorators: [
		(Story) => (
			<div className="mx-auto max-w-2xl rounded-lg border border-border bg-card pt-4">
				<Story />
			</div>
		),
	],
	args: {
		channelName: "#test-agents",
		draft,
		members: Object.values(people),
		emoji: customEmoji,
		channels: {
			C0TESTAGNT1: "test-agents",
			C0BUGS00001: "bugs",
			C0GENERAL01: "general",
			C0AGENTS: "agents",
		},
		pending: false,
		failure: null,
		onReply: fn(),
		onCommand: fn(),
	},
} satisfies Meta<typeof SlackComposer>;

export default meta;
type Story = StoryObj<typeof meta>;

/** The agent's mrkdwn draft, opened as rich text: bold, code, a mention chip and a custom emoji. */
export const WithDraft: Story = {};

/** Type `:par` for the workspace's own emoji, `@` for channel members. */
export const Empty: Story = {
	args: { draft: null },
};

export const Sending: Story = {
	args: { pending: true },
};

/** Type `/` for Slack's built-ins: `/shrug`, `/invite`, `/topic`, `/away`, `/active`. */
export const SlashCommands: Story = {
	args: { draft: "/" },
};

/** Type `#` to name a channel; it posts as Slack's channel link. */
export const ChannelPicker: Story = {
	args: { draft: null },
};

export const SendFailed: Story = {
	args: { failure: "Slack answered not_in_channel" },
};
