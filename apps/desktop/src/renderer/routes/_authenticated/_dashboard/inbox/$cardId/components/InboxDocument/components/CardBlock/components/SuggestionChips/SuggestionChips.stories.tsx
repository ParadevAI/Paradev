import type { Meta, StoryObj } from "@storybook/react-vite";
import { fn } from "storybook/test";
import { SuggestionChips } from "./SuggestionChips";

const dot = (color: string) => (
	<span className="size-2.5 rounded-full" style={{ backgroundColor: color }} />
);

const meta = {
	component: SuggestionChips,
	args: {
		suggestions: [
			{ id: "labels:bug", icon: dot("#eb5757"), text: "Bug", apply: fn() },
			{
				id: "labels:desktop",
				icon: dot("#26b5ce"),
				text: "Desktop",
				apply: fn(),
			},
		],
	},
} satisfies Meta<typeof SuggestionChips>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
export const Disabled: Story = { args: { disabled: true } };
