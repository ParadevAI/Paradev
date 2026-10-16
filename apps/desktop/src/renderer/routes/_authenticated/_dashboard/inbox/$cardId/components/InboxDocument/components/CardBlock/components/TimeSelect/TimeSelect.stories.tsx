import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, fn, userEvent, within } from "storybook/test";
import { ZONE } from "../calendarFixtures";
import { TimeSelect } from "./TimeSelect";

const meta = {
	component: TimeSelect,
	args: {
		day: { year: 2037, month: 10, day: 6 },
		value: 10 * 60,
		timeZone: ZONE,
		label: "Start time",
		onChange: fn(),
		className: "h-8 rounded-md bg-muted/60 px-2.5 text-[13px]",
	},
} satisfies Meta<typeof TimeSelect>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

/** Every quarter hour of the day, opened at the current time. */
export const Open: Story = {
	play: async ({ canvasElement }) => {
		await userEvent.click(within(canvasElement).getByRole("button"));
		await expect(
			within(document.body).getAllByRole("option").length,
		).toBeGreaterThan(0);
	},
};

/** An end on the start's day: the list begins at the start and each time carries the length. */
export const EndWithLengths: Story = {
	args: { value: 10 * 60 + 45, from: 10 * 60, label: "End time" },
	play: Open.play,
};

export const Disabled: Story = { args: { disabled: true } };
