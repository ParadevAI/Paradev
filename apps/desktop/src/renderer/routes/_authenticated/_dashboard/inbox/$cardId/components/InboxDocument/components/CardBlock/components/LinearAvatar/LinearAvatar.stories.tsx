import type { Meta, StoryObj } from "@storybook/react-vite";
import { lena, triageBot } from "../linearFixtures";
import { LinearAvatar } from "./LinearAvatar";

const meta = {
	component: LinearAvatar,
	args: { person: lena },
} satisfies Meta<typeof LinearAvatar>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Initial: Story = {};
export const App: Story = { args: { person: triageBot } };
export const Small: Story = { args: { className: "size-4 text-[9px]" } };
