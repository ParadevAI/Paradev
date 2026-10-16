import type { Meta, StoryObj } from "@storybook/react-vite";
import { fn } from "storybook/test";
import { SendFooter } from "./SendFooter";

const meta = {
	component: SendFooter,
	decorators: [
		(Story) => (
			<div className="mx-auto max-w-2xl rounded-xl border border-border bg-background">
				<Story />
			</div>
		),
	],
	args: {
		canSend: true,
		pending: false,
		failure: null,
		gmailUrl: "https://mail.google.com/",
		formatting: false,
		onSend: fn(),
		onSchedule: fn(),
		onToggleFormatting: fn(),
		onAttach: fn(),
		onLink: fn(),
		onDiscard: fn(),
	},
} satisfies Meta<typeof SendFooter>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Ready: Story = {};

export const NoRecipients: Story = {
	args: { canSend: false },
};

export const Sending: Story = {
	args: { pending: true },
};

export const Failed: Story = {
	args: { failure: "Gmail needs reconnecting" },
};

export const BlockedFiles: Story = {
	args: { blockedReason: "Gmail won't send blocked files" },
};
