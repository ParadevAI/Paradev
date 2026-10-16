import type { Meta, StoryObj } from "@storybook/react-vite";
import { kenji, packageCharge, partlyRefundedCharge } from "../stripeFixtures";
import { StripeChargeFacts } from "./StripeChargeFacts";

const meta = {
	component: StripeChargeFacts,
	decorators: [
		(Story) => (
			<div className="max-w-xl rounded-lg border border-border bg-card p-4">
				<Story />
			</div>
		),
	],
	args: { charge: packageCharge },
} satisfies Meta<typeof StripeChargeFacts>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const PartlyRefunded: Story = { args: { charge: partlyRefundedCharge } };

export const ZeroDecimal: Story = {
	args: { charge: kenji.charges[0] },
};

export const NoCardNoDescription: Story = {
	args: { charge: { ...packageCharge, card: null, description: null } },
};
