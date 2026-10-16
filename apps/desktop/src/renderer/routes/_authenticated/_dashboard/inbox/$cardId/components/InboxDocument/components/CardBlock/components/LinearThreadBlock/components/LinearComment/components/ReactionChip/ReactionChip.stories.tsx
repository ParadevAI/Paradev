import type { Meta, StoryObj } from "@storybook/react-vite";
import { fn } from "storybook/test";
import { ReactionChip } from "./ReactionChip";

const meta = {
	component: ReactionChip,
	args: {
		reaction: {
			emoji: "+1",
			count: 2,
			mine: null,
			names: ["Lena Fischer", "Marcus Oyelaran"],
		},
		onToggle: fn(),
	},
} satisfies Meta<typeof ReactionChip>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
export const Mine: Story = {
	args: {
		reaction: { emoji: "rocket", count: 1, mine: "r1", names: ["Riya Kapoor"] },
	},
};
export const ReadOnly: Story = { args: { onToggle: undefined } };
export const UnknownEmoji: Story = {
	args: { reaction: { emoji: "shipit", count: 3, mine: null, names: [] } },
};
