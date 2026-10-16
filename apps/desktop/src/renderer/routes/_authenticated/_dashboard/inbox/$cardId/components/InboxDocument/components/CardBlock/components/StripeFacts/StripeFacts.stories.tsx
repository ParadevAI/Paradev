import type { Meta, StoryObj } from "@storybook/react-vite";
import { StripeFacts } from "./StripeFacts";

const meta = {
	component: StripeFacts,
	decorators: [
		(Story) => (
			<div className="max-w-xl rounded-lg border border-border bg-card p-4">
				<Story />
			</div>
		),
	],
	args: {
		rows: [
			{ label: "Card", value: "Visa •••• 4242" },
			{ label: "Spent", value: "$69.00" },
			false,
			{ label: "Credit balance", value: "$10.00" },
		],
	},
} satisfies Meta<typeof StripeFacts>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const LongValue: Story = {
	args: {
		rows: [
			{
				label: "Description",
				value:
					"Onboarding package: four live sessions with a Lumen Labs engineer, the recordings of each session, and a written summary sent to the whole team the day after.",
			},
		],
	},
};
