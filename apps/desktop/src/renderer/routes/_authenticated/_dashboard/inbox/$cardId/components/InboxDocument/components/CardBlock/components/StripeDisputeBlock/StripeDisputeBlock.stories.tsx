import type { Meta, StoryObj } from "@storybook/react-vite";
import { fn } from "storybook/test";
import {
	closedDisputeActions,
	disputeActions,
	disputeView,
	inquiryActions,
	inquiryView,
	locked,
	lockedAccount,
	pastDueDisputeActions,
	pastDueDisputeView,
	submittedDisputeView,
} from "../stripeFixtures";
import { StripeDisputeBlock } from "./StripeDisputeBlock";

const DAY_MS = 24 * 60 * 60_000;
const LOG_LINE =
	"2037-10-04 09:02 UTC session joined by avery@example.com from 203.0.113.7 (Chrome on macOS)";

const meta = {
	component: StripeDisputeBlock,
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
		view: disputeView,
		actions: disputeActions,
		done: false,
		pending: false,
		failure: null,
		onAct: fn(),
	},
} satisfies Meta<typeof StripeDisputeBlock>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Three fields hold the agent's drafts. */
export const Default: Story = {};

export const ConfirmingSubmit: Story = {
	play: async ({ canvas, userEvent }) => {
		await userEvent.click(
			canvas.getByRole("button", { name: "Submit evidence" }),
		);
	},
};

export const ConfirmingAccept: Story = {
	play: async ({ canvas, userEvent }) => {
		await userEvent.click(
			canvas.getByRole("button", { name: "Accept dispute" }),
		);
	},
};

/** The bank asks before a dispute: respond or refund, and nothing to accept. */
export const Inquiry: Story = {
	args: { view: inquiryView, actions: inquiryActions },
};

export const ConfirmingRespond: Story = {
	args: Inquiry.args,
	play: async ({ canvas, userEvent }) => {
		await userEvent.click(
			canvas.getByRole("button", { name: "Respond to inquiry" }),
		);
	},
};

export const ConfirmingInquiryRefund: Story = {
	args: Inquiry.args,
	play: async ({ canvas, userEvent }) => {
		await userEvent.click(
			canvas.getByRole("button", { name: "Refund customer" }),
		);
	},
};

/** Two days left reads red. */
export const Urgent: Story = {
	args: {
		view: {
			...disputeView,
			dispute: {
				...disputeView.dispute,
				dueBy: new Date(Date.now() + 2 * DAY_MS).toISOString(),
			},
		},
	},
};

export const LongEvidence: Story = {
	args: {
		view: {
			...disputeView,
			evidence: {
				...disputeView.evidence,
				access_activity_log: Array.from({ length: 60 }, () => LOG_LINE).join(
					"\n",
				),
			},
		},
	},
};

/** Hover an action for the reason. */
export const PastDue: Story = {
	args: { view: pastDueDisputeView, actions: pastDueDisputeActions },
};

/** Evidence went to the bank: the form is text. */
export const Submitted: Story = {
	args: { view: submittedDisputeView, actions: closedDisputeActions },
};

export const SubmittedLongEvidence: Story = {
	args: {
		view: {
			...submittedDisputeView,
			evidence: {
				...submittedDisputeView.evidence,
				access_activity_log: Array.from({ length: 60 }, () => LOG_LINE).join(
					"\n",
				),
			},
		},
		actions: closedDisputeActions,
	},
};

export const Guest: Story = {
	args: { view: { ...disputeView, customer: null } },
};

export const Resolved: Story = { args: { done: true } };

export const Pending: Story = { args: { pending: true } };

export const Failure: Story = {
	args: { failure: "Stripe did not take the evidence. Try again." },
};

export const WritesOff: Story = {
	args: {
		view: { ...disputeView, account: lockedAccount },
		actions: locked(disputeActions),
	},
};
