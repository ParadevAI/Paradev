import type { Meta, StoryObj } from "@storybook/react-vite";
import { useState } from "react";
import { fn } from "storybook/test";
import { event, ZONE } from "../../../calendarFixtures";
import { SpanFields } from "./SpanFields";

const meta = {
	component: SpanFields,
	args: {
		value: { start: event.start, end: event.end },
		timeZone: ZONE,
		onChange: fn(),
	},
	render: function Render(args) {
		const [value, setValue] = useState(args.value);
		return (
			<SpanFields
				{...args}
				value={value}
				onChange={(next) => {
					setValue(next);
					args.onChange(next);
				}}
			/>
		);
	},
} satisfies Meta<typeof SpanFields>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

/** The same instants read in another zone. */
export const OtherZone: Story = { args: { timeZone: "Europe/Berlin" } };

/** The end is before the start: the end fields are marked. */
export const EndBeforeStart: Story = {
	args: { value: { start: event.end, end: event.start } },
};

export const Disabled: Story = { args: { disabled: true } };
