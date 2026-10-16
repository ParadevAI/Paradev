import type { Meta, StoryObj } from "@storybook/react-vite";
import { fn } from "storybook/test";
import { ResponseSelect } from "./ResponseSelect";

const meta = {
	component: ResponseSelect,
	args: { value: null, onChange: fn() },
} satisfies Meta<typeof ResponseSelect>;

export default meta;
type Story = StoryObj<typeof meta>;

/** No answer yet: the trigger asks "Going?". */
export const Unanswered: Story = {};

export const Yes: Story = { args: { value: "accepted" } };

export const Maybe: Story = { args: { value: "tentative" } };

export const Disabled: Story = { args: { value: "declined", disabled: true } };
