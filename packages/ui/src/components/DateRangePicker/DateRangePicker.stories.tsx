import type { Meta, StoryObj } from "@storybook/react-vite";
import { useState } from "react";
import { expect, fn, userEvent, waitFor, within } from "storybook/test";
import { DateRangePicker } from "./DateRangePicker";
import { type DatePreset, valueOfPreset } from "./utils/choice";

const EARLIEST = "2026-09-29";
const LATEST = "2026-11-18";

const ALL_TIME: DatePreset = {
	key: "all",
	label: "All time",
	from: EARLIEST,
	to: LATEST,
};
const LAST_7: DatePreset = {
	key: "last7",
	label: "Last 7 days",
	from: "2026-11-12",
	to: LATEST,
};
const LAST_30: DatePreset = {
	key: "last30",
	label: "Last 30 days",
	from: "2026-10-20",
	to: LATEST,
};
const LAST_90: DatePreset = {
	key: "last90",
	label: "Last 90 days",
	from: EARLIEST,
	to: LATEST,
};
const GROUPS = [[LAST_7, LAST_30, LAST_90], [ALL_TIME]];

function Controlled(props: React.ComponentProps<typeof DateRangePicker>) {
	const [value, setValue] = useState(props.value);
	return (
		<DateRangePicker
			{...props}
			value={value}
			onChange={(next) => {
				setValue(next);
				props.onChange(next);
			}}
		/>
	);
}

const meta = {
	title: "Date range picker",
	component: DateRangePicker,
	render: (args) => <Controlled {...args} />,
	decorators: [
		(Story) => (
			<div className="flex min-h-[420px] w-full max-w-[760px] justify-end p-4">
				<Story />
			</div>
		),
	],
	args: {
		value: valueOfPreset(LAST_30),
		earliest: EARLIEST,
		latest: LATEST,
		groups: GROUPS,
		onChange: fn(),
	},
} satisfies Meta<typeof DateRangePicker>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const AllTime: Story = { args: { value: valueOfPreset(ALL_TIME) } };

export const CustomRange: Story = {
	args: { value: { from: "2026-10-05", to: "2026-10-21", preset: null } },
};

export const MenuOpen: Story = {
	play: async ({ canvasElement }) => {
		await userEvent.click(within(canvasElement).getByRole("button"));
		await waitFor(() =>
			expect(within(document.body).getByText("Last 7 days")).toBeVisible(),
		);
	},
};

export const CalendarOpen: Story = {
	args: { value: { from: "2026-10-05", to: "2026-10-21", preset: null } },
	play: async ({ canvasElement }) => {
		await userEvent.click(within(canvasElement).getByRole("button"));
		await userEvent.click(
			await within(document.body).findByText(/Custom range/),
		);
		await waitFor(() =>
			expect(within(document.body).getAllByRole("grid")).not.toHaveLength(0),
		);
	},
};

export const ClampedPreset: Story = {
	args: { value: valueOfPreset(LAST_90) },
};

export const NoClosedDays: Story = {
	args: { value: null, earliest: null, latest: null },
};

export const Narrow: Story = {
	decorators: [
		(Story) => (
			<div className="w-[390px]">
				<Story />
			</div>
		),
	],
};
