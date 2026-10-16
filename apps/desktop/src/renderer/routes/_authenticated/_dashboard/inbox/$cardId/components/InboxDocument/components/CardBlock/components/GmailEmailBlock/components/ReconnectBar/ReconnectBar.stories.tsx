import type { Meta, StoryObj } from "@storybook/react-vite";
import { fn } from "storybook/test";
import { ReconnectBar } from "./ReconnectBar";

const meta = {
	component: ReconnectBar,
	args: { onConnect: fn() },
} satisfies Meta<typeof ReconnectBar>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
