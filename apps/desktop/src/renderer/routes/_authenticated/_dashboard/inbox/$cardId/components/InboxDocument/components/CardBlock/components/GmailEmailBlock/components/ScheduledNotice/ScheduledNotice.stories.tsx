import type { Meta, StoryObj } from "@storybook/react-vite";
import { ScheduledNotice } from "./ScheduledNotice";

const meta = {
	component: ScheduledNotice,
	args: { at: "2026-10-03T15:00:00.000Z" },
} satisfies Meta<typeof ScheduledNotice>;

export default meta;
type Story = StoryObj<typeof meta>;

export const TomorrowMorning: Story = {};
