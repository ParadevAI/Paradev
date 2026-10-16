import type { Meta, StoryObj } from "@storybook/react-vite";
import { fn } from "storybook/test";
import {
	draftInvoiceActions,
	draftInvoiceView,
	invoiceActions,
	invoiceView,
	liveAccount,
	locked,
	lockedAccount,
	paidInvoice,
} from "../stripeFixtures";
import { StripeInvoiceBlock } from "./StripeInvoiceBlock";

const confirms =
	(name: string): Story["play"] =>
	async ({ canvas, userEvent }) => {
		await userEvent.click(canvas.getByRole("button", { name }));
	};

const meta = {
	component: StripeInvoiceBlock,
	decorators: [
		(Story) => (
			<div className="-m-6 h-screen overflow-y-auto p-6">
				<div className="mx-auto max-w-3xl overflow-hidden rounded-lg border border-border bg-card">
					<Story />
				</div>
			</div>
		),
	],
	args: {
		view: invoiceView,
		actions: invoiceActions,
		done: false,
		pending: false,
		failure: null,
		onAct: fn(),
	},
} satisfies Meta<typeof StripeInvoiceBlock>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Open: Story = {};

export const Draft: Story = {
	args: { view: draftInvoiceView, actions: draftInvoiceActions },
};

export const ConfirmingSend: Story = { play: confirms("Send again") };

export const ConfirmingMarkPaid: Story = { play: confirms("Mark as paid") };

export const ConfirmingVoid: Story = { play: confirms("Void invoice") };

export const ConfirmingMarkUncollectible: Story = {
	play: confirms("Mark uncollectible"),
};

/** A live account sends to the customer, so the sandbox sentence is gone. */
export const Live: Story = {
	args: { view: { ...invoiceView, account: liveAccount } },
};

/** Hover an action for the reason. */
export const Paid: Story = {
	args: {
		view: { ...invoiceView, invoice: paidInvoice },
		actions: invoiceActions.map((action) =>
			action.id === "dismiss"
				? action
				: { ...action, disabled: "This invoice is already paid" },
		),
	},
};

export const Resolved: Story = { args: { done: true } };

export const Pending: Story = { args: { pending: true } };

export const Failure: Story = {
	args: { failure: "Stripe did not send the invoice. Try again." },
};

export const WritesOff: Story = {
	args: {
		view: { ...invoiceView, account: lockedAccount },
		actions: locked(invoiceActions),
	},
};
