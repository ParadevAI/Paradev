import type { Meta, StoryObj } from "@storybook/react-vite";
import { useState } from "react";
import { fn } from "storybook/test";
import {
	busy,
	event,
	findTimeView,
	slots,
	week,
	ZONE,
} from "../calendarFixtures";
import { SlotPicker } from "./SlotPicker";

const meta = {
	component: SlotPicker,
	decorators: [
		(Story) => (
			<div className="-m-6 h-screen overflow-y-auto p-6">
				<div className="mx-auto max-w-3xl rounded-lg border border-border bg-card p-4">
					<Story />
				</div>
			</div>
		),
	],
	args: {
		window: week,
		timeZone: ZONE,
		busy,
		minutes: 30,
		value: [],
		onChange: fn(),
		mode: "single",
	},
	render: function Render(args) {
		const [value, setValue] = useState(args.value);
		return (
			<SlotPicker
				{...args}
				value={value}
				onChange={(next) => {
					setValue(next);
					args.onChange(next);
				}}
			/>
		);
	},
} satisfies Meta<typeof SlotPicker>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Nothing picked: click empty time to pick half an hour. */
export const Empty: Story = {};

/** One time, free of the reader's events. */
export const SinglePicked: Story = {
	args: {
		value: [
			{ start: "2037-10-06T13:00:00-07:00", end: "2037-10-06T13:30:00-07:00" },
		],
	},
};

/** The picked time overlaps Standup and 2 Week planning. */
export const Conflict: Story = {
	args: {
		minutes: 45,
		value: [{ start: event.start, end: event.end }],
		busy: busy.filter((entry) => entry.id !== event.id),
	},
};

/** Open times suggested as outlined blocks, the first three picked, a guest's busy time shaded. */
export const Suggestions: Story = {
	args: {
		mode: "multiple",
		slots,
		guestsBusy: findTimeView.guestsBusy,
		value: slots.slice(0, 3),
	},
};

export const OneDay: Story = {
	args: {
		window: {
			start: "2037-10-06T00:00:00-07:00",
			end: "2037-10-07T00:00:00-07:00",
		},
		value: [{ start: event.start, end: event.end }],
		minutes: 45,
	},
};

export const SevenDays: Story = {
	args: {
		window: {
			start: "2037-10-04T00:00:00-07:00",
			end: "2037-10-11T00:00:00-07:00",
		},
		mode: "multiple",
		slots,
	},
};

/** The week the clocks go back: Sunday has 25 hours and still lines up. */
export const ClockChange: Story = {
	args: {
		window: {
			start: "2037-10-30T00:00:00-07:00",
			end: "2037-11-03T00:00:00-08:00",
		},
		busy: [],
		value: [
			{ start: "2037-11-01T17:00:00.000Z", end: "2037-11-01T17:30:00.000Z" },
		],
	},
};

export const Disabled: Story = {
	args: { disabled: true, mode: "multiple", slots, value: slots.slice(0, 2) },
};
