import type { Meta, StoryObj } from "@storybook/react-vite";
import { fn } from "storybook/test";
import { StripeMoneyField } from "./StripeMoneyField";

const meta = {
	component: StripeMoneyField,
	decorators: [
		(Story) => (
			<div className="max-w-xl rounded-lg border border-border bg-card p-4">
				<Story />
			</div>
		),
	],
	args: {
		label: "Refund amount",
		value: "25.00",
		currency: "usd",
		onChange: fn(),
	},
} satisfies Meta<typeof StripeMoneyField>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const ZeroDecimal: Story = { args: { value: "4900", currency: "jpy" } };

export const Invalid: Story = { args: { value: "49.001", invalid: true } };

export const WithError: Story = {
	args: { value: "80.00", error: "Amount cannot be more than $75.00." },
};

export const Disabled: Story = { args: { disabled: true } };
