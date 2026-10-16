import type { Meta, StoryObj } from "@storybook/react-vite";
import { fn } from "storybook/test";
import { StripeSelect } from "./StripeSelect";

const meta = {
	component: StripeSelect,
	decorators: [
		(Story) => (
			<div className="max-w-xl rounded-lg border border-border bg-card p-4">
				<Story />
			</div>
		),
	],
	args: {
		label: "Adjustment type",
		value: "credit",
		onChange: fn(),
		options: [
			{ value: "credit", label: "Credit" },
			{ value: "debit", label: "Debit" },
		],
	},
} satisfies Meta<typeof StripeSelect>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const Disabled: Story = { args: { disabled: true } };
