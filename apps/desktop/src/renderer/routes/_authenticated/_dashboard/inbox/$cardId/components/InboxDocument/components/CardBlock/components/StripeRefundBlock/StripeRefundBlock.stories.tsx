import type { Meta, StoryObj } from "@storybook/react-vite";
import { fn } from "storybook/test";
import {
	averyTwoPlans,
	guestRefundView,
	locked,
	lockedAccount,
	partRefundView,
	pro,
	refundActions,
	refundNoEmailView,
	refundView,
	yenRefundView,
} from "../stripeFixtures";
import { StripeRefundBlock } from "./StripeRefundBlock";

const email = refundView.email as NonNullable<typeof refundView.email>;

const meta = {
	component: StripeRefundBlock,
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
		view: refundView,
		actions: refundActions,
		done: false,
		pending: false,
		failure: null,
		onAct: fn(),
	},
} satisfies Meta<typeof StripeRefundBlock>;

export default meta;
type Story = StoryObj<typeof meta>;

/** A request that came in by email: half of the charge, with the drafted reply. */
export const Default: Story = {};

export const Confirming: Story = {
	play: async ({ canvas, userEvent }) => {
		await userEvent.click(canvas.getByRole("button", { name: "Refund" }));
	},
};

const withReason = (reason: "fraudulent" | "other") => ({
	view: {
		...refundNoEmailView,
		proposed: { ...refundNoEmailView.proposed, reason },
	},
});

/** The button reads "Refund and block". */
export const Fraudulent: Story = { args: withReason("fraudulent") };

export const ConfirmingFraudulent: Story = {
	args: Fraudulent.args,
	play: async ({ canvas, userEvent }) => {
		await userEvent.click(
			canvas.getByRole("button", { name: "Refund and block" }),
		);
	},
};

export const OtherReason: Story = { args: withReason("other") };

export const NoEmail: Story = { args: { view: refundNoEmailView } };

/** $10.00 went back before: $39.00 is left. */
export const PartlyRefunded: Story = { args: { view: partRefundView } };

export const InvalidAmount: Story = {
	args: {
		view: {
			...refundNoEmailView,
			proposed: { ...refundNoEmailView.proposed, amount: 4900 },
			refundable: 3900,
		},
	},
};

/** The agent suggests the subscription goes with the refund; the customer has two. */
export const WithCancel: Story = {
	args: {
		view: {
			...refundView,
			customer: averyTwoPlans,
			proposed: { ...refundView.proposed, cancel: pro.id },
		},
	},
};

export const ConfirmingWithCancel: Story = {
	args: WithCancel.args,
	play: Confirming.play,
};

export const ZeroAmount: Story = {
	args: {
		view: {
			...refundNoEmailView,
			proposed: { ...refundNoEmailView.proposed, amount: 0 },
		},
	},
};

export const Guest: Story = { args: { view: guestRefundView } };

export const ZeroDecimal: Story = { args: { view: yenRefundView } };

/** Gmail is not connected: hover the reply box for the reason. */
export const CannotReply: Story = {
	args: { view: { ...refundView, email: { ...email, canReply: false } } },
};

export const Resolved: Story = { args: { done: true } };

export const Pending: Story = { args: { pending: true } };

export const Failure: Story = {
	args: { failure: "Only $10.00 is left to refund on this charge" },
};

/** Hover "Refund" for the reason. */
export const WritesOff: Story = {
	args: {
		view: { ...refundView, account: lockedAccount },
		actions: locked(refundActions),
	},
};

export const NothingLeft: Story = {
	args: {
		view: {
			...refundNoEmailView,
			charge: { ...refundView.charge, refunded: 4900 },
			refundable: 0,
			proposed: { amount: 0, reason: null, cancel: null },
		},
		actions: refundActions.map((action) =>
			action.id === "refund"
				? { ...action, disabled: "This charge has nothing left to refund" }
				: action,
		),
	},
};
