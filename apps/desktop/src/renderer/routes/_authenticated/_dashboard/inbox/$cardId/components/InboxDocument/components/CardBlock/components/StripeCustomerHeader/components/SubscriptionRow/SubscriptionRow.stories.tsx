import type { Meta, StoryObj } from "@storybook/react-vite";
import {
	blake,
	kenji,
	pausedPro,
	pro,
	teamAddOn,
} from "../../../stripeFixtures";
import { SubscriptionRow } from "./SubscriptionRow";

const meta = {
	component: SubscriptionRow,
	decorators: [
		(Story) => (
			<ul className="max-w-xl rounded-lg border border-border bg-card p-4 text-[13px]">
				<Story />
			</ul>
		),
	],
	args: { subscription: pro },
} satisfies Meta<typeof SubscriptionRow>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Active: Story = {};

export const Trialing: Story = {
	args: { subscription: blake.subscriptions[0] },
};

export const Paused: Story = { args: { subscription: pausedPro } };

export const PausedIndefinitely: Story = {
	args: { subscription: { ...pro, paused: { resumesAt: null } } },
};

export const Cancelling: Story = {
	args: { subscription: { ...pro, cancelAtPeriodEnd: true } },
};

export const Canceled: Story = {
	args: { subscription: { ...pro, status: "canceled" } },
};

export const YearlyWithQuantity: Story = { args: { subscription: teamAddOn } };

/** Three items, one billed by usage: the price is a floor. */
export const SeveralItemsMetered: Story = {
	args: { subscription: { ...pro, items: 3, metered: true } },
};

export const UsageBased: Story = {
	args: {
		subscription: { ...pro, metered: true, price: { ...pro.price, amount: 0 } },
	},
};

export const ZeroDecimal: Story = {
	args: { subscription: kenji.subscriptions[0] },
};
