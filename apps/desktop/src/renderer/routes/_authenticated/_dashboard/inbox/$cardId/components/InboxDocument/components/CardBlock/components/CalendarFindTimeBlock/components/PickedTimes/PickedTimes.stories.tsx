import type { Meta, StoryObj } from "@storybook/react-vite";
import { fn } from "storybook/test";
import { findTimeActions, slots, ZONE } from "../../../calendarFixtures";
import { PickedTimes } from "./PickedTimes";

const meta = {
	component: PickedTimes,
	args: {
		times: slots.slice(0, 3),
		timeZone: ZONE,
		create: findTimeActions[1],
		pending: false,
		past: () => false,
		onCreate: fn(),
	},
} satisfies Meta<typeof PickedTimes>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Several times: each can become the event. */
export const Several: Story = {};

export const One: Story = {
	args: { times: slots.slice(0, 1), create: undefined },
};
