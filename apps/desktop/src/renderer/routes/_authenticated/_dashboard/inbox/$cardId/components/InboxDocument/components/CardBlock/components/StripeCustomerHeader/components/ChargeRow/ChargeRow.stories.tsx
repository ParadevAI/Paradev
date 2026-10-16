import type { Meta, StoryObj } from "@storybook/react-vite";
import { avery, kenji, partlyRefundedCharge } from "../../../stripeFixtures";
import { ChargeRow } from "./ChargeRow";

const meta = {
	component: ChargeRow,
	decorators: [
		(Story) => (
			<ul className="max-w-xl rounded-lg border border-border bg-card p-4 text-[13px]">
				<Story />
			</ul>
		),
	],
	args: { charge: avery.charges[0] },
} satisfies Meta<typeof ChargeRow>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Succeeded: Story = {};

export const PartlyRefunded: Story = { args: { charge: partlyRefundedCharge } };

export const Refunded: Story = { args: { charge: avery.charges[2] } };

export const Failed: Story = { args: { charge: avery.charges[3] } };

export const Disputed: Story = { args: { charge: avery.charges[4] } };

export const ZeroDecimal: Story = { args: { charge: kenji.charges[0] } };
