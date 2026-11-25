import type { Meta, StoryObj } from "@storybook/react-vite";
import { Sparkline } from "./Sparkline";

const meta = {
	title: "Sparkline",
	component: Sparkline,
	args: {
		title: "Usage, last 30 days",
		points: [
			0, 0, 48, 1041, 905, 875, 616, 8195, 2701, 1010, 1464, 234, 60, 0, 8, 2,
			0, 0, 311, 540, 770, 902, 650, 480, 300, 220, 410, 530, 480, 260,
		],
	},
} satisfies Meta<typeof Sparkline>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const NoUsage: Story = { args: { points: Array(30).fill(0) } };

export const NoPoints: Story = { args: { points: [] } };

export const OnePoint: Story = { args: { points: [12] } };

export const Narrow: Story = {
	decorators: [
		(Story) => (
			<div className="w-10">
				<Story />
			</div>
		),
	],
};

export const Wide: Story = {
	decorators: [
		(Story) => (
			<div className="w-80">
				<Story />
			</div>
		),
	],
};
