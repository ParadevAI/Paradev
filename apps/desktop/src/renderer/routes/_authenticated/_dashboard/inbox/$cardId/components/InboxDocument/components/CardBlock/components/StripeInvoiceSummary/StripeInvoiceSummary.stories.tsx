import type { Meta, StoryObj } from "@storybook/react-vite";
import {
	draftInvoice,
	failedInvoice,
	openInvoice,
	paidInvoice,
} from "../stripeFixtures";
import { StripeInvoiceSummary } from "./StripeInvoiceSummary";

const meta = {
	component: StripeInvoiceSummary,
	decorators: [
		(Story) => (
			<div className="max-w-xl rounded-lg border border-border bg-card p-4">
				<Story />
			</div>
		),
	],
	args: { invoice: openInvoice },
} satisfies Meta<typeof StripeInvoiceSummary>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Open: Story = {};

export const Draft: Story = { args: { invoice: draftInvoice } };

export const Paid: Story = { args: { invoice: paidInvoice } };

/** Two attempts failed and Stripe tries again on Oct 8. */
export const FailedPayment: Story = { args: { invoice: failedInvoice } };

export const ZeroDecimal: Story = {
	args: {
		invoice: {
			...openInvoice,
			currency: "jpy",
			total: 4900,
			amountDue: 4900,
			lines: [{ description: "1 × Pro (at ¥4,900 / month)", amount: 4900 }],
		},
	},
};
