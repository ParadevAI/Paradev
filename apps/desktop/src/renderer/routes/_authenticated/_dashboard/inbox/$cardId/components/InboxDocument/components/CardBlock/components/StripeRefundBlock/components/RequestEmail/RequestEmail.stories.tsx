import type { Meta, StoryObj } from "@storybook/react-vite";
import { fn } from "storybook/test";
import { refundView } from "../../../stripeFixtures";
import { RequestEmail } from "./RequestEmail";

const email = refundView.email as NonNullable<typeof refundView.email>;

const meta = {
	component: RequestEmail,
	decorators: [
		(Story) => (
			<div className="max-w-xl rounded-lg border border-border bg-card p-4">
				<Story />
			</div>
		),
	],
	args: {
		email,
		customerEmail: "avery@example.com",
		reply: email.draft,
		onReply: fn(),
		replying: true,
		disabled: false,
	},
} satisfies Meta<typeof RequestEmail>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const NoDraft: Story = { args: { reply: "" } };

export const NoSubject: Story = {
	args: { email: { ...email, subject: null } },
};

/** Gmail is not connected: hover the box for the reason. */
export const CannotReply: Story = {
	args: { email: { ...email, canReply: false } },
};

/** The email came from an address Stripe does not hold for the customer. */
export const NotFromCustomer: Story = {
	args: { email: { ...email, fromCustomer: false } },
};

export const Settled: Story = { args: { replying: false } };

export const Pending: Story = { args: { disabled: true } };
