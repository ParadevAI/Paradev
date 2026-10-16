import type { Meta, StoryObj } from "@storybook/react-vite";
import { fn } from "storybook/test";
import { ThreadHeader } from "./ThreadHeader";

const meta = {
	component: ThreadHeader,
	decorators: [
		(Story) => (
			<div className="mx-auto max-w-3xl bg-card">
				<Story />
			</div>
		),
	],
	args: {
		subject: "Team offsite in Tahoe",
		labels: [
			{ id: "INBOX", name: "Inbox", color: null },
			{ id: "IMPORTANT", name: "IMPORTANT", color: null },
			{ id: "CATEGORY_PERSONAL", name: "CATEGORY_PERSONAL", color: null },
			{
				id: "Label_1",
				name: "Offsite",
				color: { background: "#16a766", text: "#ffffff" },
			},
		],
		printUrl: "https://mail.google.com/mail/?view=pt&th=1a0fb9dc85867470",
		onRemoveLabel: fn(),
		onToggleExpanded: fn(),
		expanded: false,
	},
} satisfies Meta<typeof ThreadHeader>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const AllExpanded: Story = {
	args: { expanded: true },
};

/** Settled, one message, no label editing: just the subject and Gmail's print button. */
export const Settled: Story = {
	args: {
		onRemoveLabel: undefined,
		onToggleExpanded: undefined,
	},
};

export const LongSubject: Story = {
	args: {
		subject:
			"Re: Q4 planning: offsite agenda, budget sign-off, and who is driving the second car up on Tuesday morning",
	},
};
