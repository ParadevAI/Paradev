import type { Meta, StoryObj } from "@storybook/react-vite";
import { guests } from "../../../calendarFixtures";
import { GuestList } from "./GuestList";

const meta = {
	component: GuestList,
	args: { guests },
} satisfies Meta<typeof GuestList>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Two yes, one no with a note, one optional maybe, two who have not answered. */
export const Mixed: Story = {};

export const OneGuest: Story = { args: { guests: guests.slice(0, 1) } };

export const NobodyAnswered: Story = {
	args: {
		guests: guests.map((guest) => ({ ...guest, response: "needsAction" })),
	},
};
