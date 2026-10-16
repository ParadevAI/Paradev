import type { Meta, StoryObj } from "@storybook/react-vite";
import { fn } from "storybook/test";
import { HiddenCount } from "./HiddenCount";

const meta = {
	component: HiddenCount,
	decorators: [
		(Story) => (
			<div className="mx-auto max-w-3xl bg-card py-6">
				<Story />
			</div>
		),
	],
	args: { count: 7, onReveal: fn() },
} satisfies Meta<typeof HiddenCount>;

export default meta;
type Story = StoryObj<typeof meta>;

export const SevenOlder: Story = {};
