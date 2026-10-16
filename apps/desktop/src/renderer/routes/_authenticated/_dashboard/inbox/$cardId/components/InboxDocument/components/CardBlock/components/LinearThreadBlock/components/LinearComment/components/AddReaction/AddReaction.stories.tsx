import type { Meta, StoryObj } from "@storybook/react-vite";
import { fn } from "storybook/test";
import { AddReaction } from "./AddReaction";

const meta = {
	component: AddReaction,
	args: { onPick: fn() },
} satisfies Meta<typeof AddReaction>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Open: Story = {
	decorators: [
		(Story) => (
			<div className="pt-[30rem]">
				<Story />
			</div>
		),
	],
	play: async ({ canvas, userEvent }) => {
		await userEvent.click(canvas.getByRole("button", { name: "Add reaction" }));
	},
};
