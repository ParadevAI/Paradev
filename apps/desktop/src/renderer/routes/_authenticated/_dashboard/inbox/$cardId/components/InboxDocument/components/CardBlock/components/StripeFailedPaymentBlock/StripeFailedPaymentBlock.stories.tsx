import type { Meta, StoryObj } from "@storybook/react-vite";
import { fn } from "storybook/test";
import {
	failedPaymentActions,
	failedPaymentView,
	locked,
	lockedAccount,
} from "../stripeFixtures";
import { StripeFailedPaymentBlock } from "./StripeFailedPaymentBlock";

const meta = {
	component: StripeFailedPaymentBlock,
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
		view: failedPaymentView,
		actions: failedPaymentActions,
		done: false,
		pending: false,
		failure: null,
		onAct: fn(),
	},
} satisfies Meta<typeof StripeFailedPaymentBlock>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const ConfirmingCharge: Story = {
	play: async ({ canvas, userEvent }) => {
		await userEvent.click(
			canvas.getByRole("button", { name: "Charge customer" }),
		);
	},
};

export const ConfirmingEmail: Story = {
	play: async ({ canvas, userEvent }) => {
		await userEvent.click(
			canvas.getByRole("button", { name: "Send update-card link" }),
		);
	},
};

/** Hover "Send update-card link" for the reason. */
export const GmailNotConnected: Story = {
	args: {
		view: {
			...failedPaymentView,
			email: { ...failedPaymentView.email, canSend: false },
		},
		actions: failedPaymentActions.map((action) =>
			action.id === "send_link"
				? { ...action, disabled: "Connect Gmail to email the customer" }
				: action,
		),
	},
};

export const Resolved: Story = { args: { done: true } };

export const Pending: Story = { args: { pending: true } };

export const Failure: Story = {
	args: { failure: "Your card has insufficient funds." },
};

export const WritesOff: Story = {
	args: {
		view: { ...failedPaymentView, account: lockedAccount },
		actions: locked(failedPaymentActions),
	},
};
