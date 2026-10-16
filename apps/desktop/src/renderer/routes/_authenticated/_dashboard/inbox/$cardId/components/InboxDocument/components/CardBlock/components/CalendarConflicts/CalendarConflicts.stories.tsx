import type { Meta, StoryObj } from "@storybook/react-vite";
import { conflicts, lunch, prepDay, ZONE } from "../calendarFixtures";
import { CalendarConflicts } from "./CalendarConflicts";

const meta = {
	component: CalendarConflicts,
	args: { conflicts, timeZone: ZONE },
} satisfies Meta<typeof CalendarConflicts>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Several: Story = {};

export const One: Story = { args: { conflicts: [lunch] } };

/** An all-day event reads "All day" in place of a time. */
export const AllDay: Story = { args: { conflicts: [prepDay, lunch] } };
