import type { Meta, StoryObj } from "@storybook/react-vite";
import { fn } from "storybook/test";
import {
	avery,
	cancelAtPeriodEndView,
	cancelView,
	locked,
	lockedAccount,
	pauseActions,
	pauseDefaultsView,
	pausedActions,
	pausedView,
	pauseView,
	pro,
	subscriptionActions,
} from "../stripeFixtures";
import { StripeSubscriptionBlock } from "./StripeSubscriptionBlock";

const pausedForever = { ...pro, paused: { resumesAt: null } };

const meta = {
	component: StripeSubscriptionBlock,
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
		view: cancelView,
		actions: subscriptionActions,
		done: false,
		pending: false,
		failure: null,
		onAct: fn(),
	},
} satisfies Meta<typeof StripeSubscriptionBlock>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Cancel now with the unused part of the month back. */
export const CancelProrated: Story = {};

export const CancelLastPayment: Story = {
	args: {
		view: {
			...cancelView,
			proposed: { ...cancelView.proposed, refund: "last_payment" },
		},
	},
};

export const CancelNoRefund: Story = {
	args: {
		view: {
			...cancelView,
			proposed: { ...cancelView.proposed, refund: "none" },
		},
	},
};

/** No refund goes with a cancel at the end of the period. */
export const CancelAtPeriodEnd: Story = {
	args: { view: cancelAtPeriodEndView },
};

export const ConfirmingCancelAtPeriodEnd: Story = {
	args: CancelAtPeriodEnd.args,
	play: async ({ canvas, userEvent }) => {
		await userEvent.click(
			canvas.getByRole("button", { name: "Cancel subscription" }),
		);
	},
};

/** No payment to give back: "No refund" is the one choice. */
export const CancelNothingToRefund: Story = {
	args: {
		view: {
			...cancelView,
			preview: {
				...cancelView.preview,
				prorated: { amount: 0, currency: "usd" },
				lastPayment: null,
			},
		},
	},
};

export const ConfirmingCancel: Story = {
	play: async ({ canvas, userEvent }) => {
		await userEvent.click(
			canvas.getByRole("button", { name: "Cancel subscription" }),
		);
	},
};

export const PauseUntil: Story = {
	args: { view: pauseView, actions: pauseActions },
};

/** Stripe's defaults: no end date, and invoices kept as drafts. */
export const PauseDefaults: Story = {
	args: { view: pauseDefaultsView, actions: pauseActions },
};

export const ConfirmingPauseDefaults: Story = {
	args: PauseDefaults.args,
	play: async ({ canvas, userEvent }) => {
		await userEvent.click(canvas.getByRole("button", { name: "Pause" }));
	},
};

export const ConfirmingPause: Story = {
	args: PauseUntil.args,
	play: async ({ canvas, userEvent }) => {
		await userEvent.click(canvas.getByRole("button", { name: "Pause" }));
	},
};

/** Paused already: resume it, or cancel. */
export const Paused: Story = {
	args: { view: pausedView, actions: pausedActions },
};

export const PausedIndefinitely: Story = {
	args: {
		view: {
			...pausedView,
			customer: { ...avery, subscriptions: [pausedForever] },
			subscription: pausedForever,
		},
		actions: pausedActions,
	},
};

export const CanceledAlready: Story = {
	args: {
		view: {
			...cancelView,
			customer: { ...avery, subscriptions: [{ ...pro, status: "canceled" }] },
			subscription: { ...pro, status: "canceled" },
		},
		actions: [
			{ id: "dismiss", label: "Done", style: "secondary", role: "dismiss" },
		],
	},
};

export const Resolved: Story = { args: { done: true } };

export const Pending: Story = { args: { pending: true } };

export const Failure: Story = {
	args: {
		failure: "The prorated amount changed. Look again before you cancel",
	},
};

/** Hover an action for the reason. */
export const WritesOff: Story = {
	args: {
		view: { ...cancelView, account: lockedAccount },
		actions: locked(subscriptionActions),
	},
};
