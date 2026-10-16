import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, fn, userEvent, within } from "storybook/test";
import { DateField } from "./DateField";

const meta = {
	component: DateField,
	args: {
		value: { year: 2037, month: 10, day: 6 },
		label: "Start date",
		onChange: fn(),
		className: "h-8 rounded-md bg-muted/60 px-2.5 text-[13px]",
	},
} satisfies Meta<typeof DateField>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

/** The month, with the chosen day marked. */
export const Open: Story = {
	play: async ({ canvasElement }) => {
		await userEvent.click(within(canvasElement).getByRole("button"));
		await expect(within(document.body).getByRole("grid")).toBeTruthy();
	},
};

export const Disabled: Story = { args: { disabled: true } };
