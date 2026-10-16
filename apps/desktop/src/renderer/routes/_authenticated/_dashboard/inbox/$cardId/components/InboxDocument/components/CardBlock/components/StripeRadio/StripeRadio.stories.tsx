import type { Meta, StoryObj } from "@storybook/react-vite";
import { fn } from "storybook/test";
import { StripeRadio } from "./StripeRadio";

const meta = {
	component: StripeRadio,
	decorators: [
		(Story) => (
			<div className="max-w-xl rounded-lg border border-border bg-card p-4">
				<Story />
			</div>
		),
	],
	args: {
		label: "Refund",
		value: "prorated",
		onChange: fn(),
		options: [
			{ value: "none", label: "No refund" },
			{ value: "last_payment", label: "Last payment $20.00" },
			{ value: "prorated", label: "Prorated amount $13.42 of $20.00" },
		],
	},
} satisfies Meta<typeof StripeRadio>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const WithDetail: Story = {
	args: {
		label: "Visibility",
		value: "private",
		options: [
			{ value: "public", label: "Public", detail: "Anyone in Lumen Labs" },
			{ value: "private", label: "Private", detail: "Only specific people" },
		],
	},
};

export const WithDescription: Story = {
	args: {
		label: "Cancel",
		value: "now",
		options: [
			{ value: "now", label: "Immediately", description: "Oct 1, 2037" },
			{
				value: "period_end",
				label: "End of the current period",
				description: "Nov 3, 2037",
			},
		],
	},
};

export const WithControl: Story = {
	args: {
		label: "Duration",
		value: "until",
		options: [
			{
				value: "indefinite",
				label: "Indefinite",
				description:
					"We'll keep payment collection paused until you resume it.",
			},
			{
				value: "until",
				label: "Until a custom date",
				description:
					"We'll automatically resume payment collection on the date you choose.",
				control: (
					<button
						type="button"
						className="h-8 rounded-md border border-input px-2 text-[13px]"
					>
						Nov 3, 2037
					</button>
				),
			},
		],
	},
};

export const Disabled: Story = { args: { disabled: true } };
