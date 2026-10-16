import type { Meta, StoryObj } from "@storybook/react-vite";
import {
	account,
	avery,
	averyTwoPlans,
	blake,
	devon,
	kenji,
	lockedAccount,
} from "../stripeFixtures";
import { StripeCustomerHeader } from "./StripeCustomerHeader";

const meta = {
	component: StripeCustomerHeader,
	decorators: [
		(Story) => (
			<div className="-m-6 h-screen overflow-y-auto p-6">
				<div className="mx-auto max-w-3xl overflow-hidden rounded-lg border border-border bg-card">
					<Story />
				</div>
			</div>
		),
	],
	args: { customer: avery, account },
} satisfies Meta<typeof StripeCustomerHeader>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const AllCharges: Story = {
	play: async ({ canvas, userEvent }) => {
		await userEvent.click(canvas.getByRole("button", { name: "Show all" }));
	},
};

export const TwoSubscriptionsAndCredit: Story = {
	args: { customer: averyTwoPlans },
};

export const Delinquent: Story = { args: { customer: devon } };

export const TrialNoCardNoCharges: Story = { args: { customer: blake } };

export const ZeroDecimal: Story = { args: { customer: kenji } };

export const NoName: Story = { args: { customer: { ...avery, name: null } } };

/** A charge with no customer behind it. */
export const Guest: Story = { args: { customer: null } };

export const WritesOff: Story = { args: { account: lockedAccount } };
