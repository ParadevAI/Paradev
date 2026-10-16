import type { Meta, StoryObj } from "@storybook/react-vite";
import { fn } from "storybook/test";
import { QuoteToggle } from "./QuoteToggle";

const meta = {
	component: QuoteToggle,
	args: { open: false, onToggle: fn() },
} satisfies Meta<typeof QuoteToggle>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Folded: Story = {};

export const Shown: Story = {
	args: { open: true },
};
