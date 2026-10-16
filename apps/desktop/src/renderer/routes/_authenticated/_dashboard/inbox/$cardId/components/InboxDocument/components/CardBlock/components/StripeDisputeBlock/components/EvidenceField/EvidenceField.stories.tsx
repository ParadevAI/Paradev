import type { Meta, StoryObj } from "@storybook/react-vite";
import { fn } from "storybook/test";
import { disputeView } from "../../../stripeFixtures";
import { EvidenceField } from "./EvidenceField";

const meta = {
	component: EvidenceField,
	decorators: [
		(Story) => (
			<div className="max-w-xl rounded-lg border border-border bg-card p-4">
				<Story />
			</div>
		),
	],
	args: {
		label: "Product description",
		value: disputeView.evidence.product_description,
		onChange: fn(),
		long: true,
		maxLength: 8000,
		drafted: false,
		readOnly: false,
		disabled: false,
	},
} satisfies Meta<typeof EvidenceField>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Long: Story = {};

export const Short: Story = {
	args: {
		label: "Customer name",
		value: "Avery Chen",
		long: false,
		maxLength: 300,
	},
};

export const Drafted: Story = { args: { drafted: true } };

export const ReadOnly: Story = { args: { readOnly: true } };

export const ReadOnlyEmpty: Story = { args: { readOnly: true, value: "" } };

export const Disabled: Story = { args: { disabled: true } };
