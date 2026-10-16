import type { Meta, StoryObj } from "@storybook/react-vite";
import { StripeTag } from "./StripeTag";

const meta = {
	component: StripeTag,
	decorators: [
		(Story) => (
			<div className="flex">
				<Story />
			</div>
		),
	],
	args: { children: "Test mode", tone: "warn" },
} satisfies Meta<typeof StripeTag>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Warn: Story = {};

export const Neutral: Story = {
	args: { children: "Canceled", tone: "neutral" },
};

export const Good: Story = { args: { children: "Active", tone: "good" } };

export const Bad: Story = { args: { children: "Disputed", tone: "bad" } };
