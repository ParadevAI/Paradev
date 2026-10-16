import type { Meta, StoryObj } from "@storybook/react-vite";
import { useState } from "react";
import { fn } from "storybook/test";
import { busy, event, week } from "../calendarFixtures";
import { CalendarTimeEditor } from "./CalendarTimeEditor";

const meta = {
	component: CalendarTimeEditor,
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
		event,
		label: "Your proposal:",
		value: { start: event.start, end: event.end },
		onChange: fn(),
		busy,
		window: week,
		disabled: false,
	},
	render: function Render(args) {
		const [value, setValue] = useState(args.value);
		return (
			<CalendarTimeEditor
				{...args}
				value={value}
				onChange={(next) => {
					setValue(next);
					args.onChange(next);
				}}
			/>
		);
	},
} satisfies Meta<typeof CalendarTimeEditor>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const Disabled: Story = { args: { disabled: true } };
