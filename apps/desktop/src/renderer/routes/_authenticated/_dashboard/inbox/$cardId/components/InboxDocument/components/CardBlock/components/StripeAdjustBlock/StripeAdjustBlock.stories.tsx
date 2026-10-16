import type { Meta, StoryObj } from "@storybook/react-vite";
import { fn } from "storybook/test";
import {
	couponActions,
	couponTwoPlansView,
	couponView,
	creditActions,
	creditView,
	debitView,
	locked,
	lockedAccount,
	trialActions,
	trialView,
} from "../stripeFixtures";
import { StripeAdjustBlock } from "./StripeAdjustBlock";

const meta = {
	component: StripeAdjustBlock,
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
		view: couponView,
		actions: couponActions,
		done: false,
		pending: false,
		failure: null,
		onAct: fn(),
	},
} satisfies Meta<typeof StripeAdjustBlock>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Coupon: Story = {};

/** Two subscriptions: the reader says which one the coupon goes on. */
export const CouponTwoSubscriptions: Story = {
	args: { view: couponTwoPlansView },
};

export const ConfirmingCoupon: Story = {
	play: async ({ canvas, userEvent }) => {
		await userEvent.click(canvas.getByRole("button", { name: "Apply coupon" }));
	},
};

export const Credit: Story = {
	args: { view: creditView, actions: creditActions },
};

export const CreditNoAmount: Story = {
	args: {
		view: {
			...creditView,
			proposed: { ...creditView.proposed, credit: null, note: "" },
		},
		actions: creditActions,
	},
};

const confirmsCredit: Story["play"] = async ({ canvas, userEvent }) => {
	await userEvent.click(
		canvas.getByRole("button", { name: "Apply to credit balance" }),
	);
};

export const ConfirmingCredit: Story = {
	args: Credit.args,
	play: confirmsCredit,
};

/** $10.00 comes off the credit the customer holds. */
export const CreditAsDebit: Story = {
	args: { view: debitView, actions: creditActions },
};

export const ConfirmingDebit: Story = {
	args: CreditAsDebit.args,
	play: confirmsCredit,
};

export const Trial: Story = {
	args: { view: trialView, actions: trialActions },
};

export const TrialInThePast: Story = {
	args: {
		view: {
			...trialView,
			proposed: { ...trialView.proposed, trialEnd: "2025-09-24T12:00:00.000Z" },
		},
		actions: trialActions,
	},
};

export const ConfirmingTrial: Story = {
	args: Trial.args,
	play: async ({ canvas, userEvent }) => {
		await userEvent.click(canvas.getByRole("button", { name: "Extend trial" }));
	},
};

export const Resolved: Story = { args: { done: true } };

export const Pending: Story = { args: { pending: true } };

export const Failure: Story = {
	args: { failure: "That coupon is not one this account can still use" },
};

/** Hover "Apply coupon" for the reason. */
export const WritesOff: Story = {
	args: {
		view: { ...couponView, account: lockedAccount },
		actions: locked(couponActions),
	},
};
