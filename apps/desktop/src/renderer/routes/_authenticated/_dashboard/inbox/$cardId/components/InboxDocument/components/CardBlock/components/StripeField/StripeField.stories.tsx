import type { Meta, StoryObj } from "@storybook/react-vite";
import { Input } from "@superset/ui/input";
import { StripeTag } from "../StripeTag";
import { StripeField } from "./StripeField";

const meta = {
	component: StripeField,
	decorators: [
		(Story) => (
			<div className="max-w-xl rounded-lg border border-border bg-card p-4">
				<Story />
			</div>
		),
	],
	args: {
		label: "Customer name",
		children: <Input defaultValue="Avery Chen" aria-label="Customer name" />,
	},
} satisfies Meta<typeof StripeField>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const Tagged: Story = {
	args: { tag: <StripeTag tone="warn">Drafted</StripeTag> },
};
