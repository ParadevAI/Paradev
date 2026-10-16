import type { Meta, StoryObj } from "@storybook/react-vite";
import { StripeStatus } from "./StripeStatus";

const meta = {
	component: StripeStatus,
	decorators: [
		(Story) => (
			<div className="flex">
				<Story />
			</div>
		),
	],
	args: { status: "active" },
} satisfies Meta<typeof StripeStatus>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Active: Story = {};

export const PastDue: Story = { args: { status: "past_due" } };

export const Failed: Story = { args: { status: "failed" } };

export const NeedsResponse: Story = { args: { status: "needs_response" } };

export const Canceled: Story = { args: { status: "canceled" } };

/** A status the card has no word for reads with its underscores as spaces. */
export const Unknown: Story = { args: { status: "awaiting_bank_review" } };
