import type { Meta, StoryObj } from "@storybook/react-vite";
import { useState } from "react";
import { expect, fn, userEvent, waitFor, within } from "storybook/test";
import { DateRangePicker } from "./DateRangePicker";
import {
	type DatePreset,
	type DateRangeValue,
	valueOfPreset,
} from "./utils/choice";

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

const dataOf = (value: DateRangeValue) => ({
	value,
	bounds: { earliest: EARLIEST, latest: LATEST },
});

function Controlled(props: React.ComponentProps<typeof DateRangePicker>) {
	const [value, setValue] = useState(props.data?.value);
	return (
		<DateRangePicker
			{...props}
			data={props.data && value ? { ...props.data, value } : null}
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
		data: dataOf(valueOfPreset(LAST_30)),
		groups: GROUPS,
		onChange: fn(),
	},
} satisfies Meta<typeof DateRangePicker>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const AllTime: Story = {
	args: { data: dataOf(valueOfPreset(ALL_TIME)) },
};

export const CustomRange: Story = {
	args: {
		data: dataOf({ from: "2026-10-05", to: "2026-10-21", preset: null }),
	},
};

export const MenuOpen: Story = {
	play: async ({ canvasElement }) => {
		await userEvent.click(within(canvasElement).getByRole("button"));
		await waitFor(() =>
			expect(
				within(document.body).getByRole("menuitemradio", {
					name: /Last 7 days/,
				}),
			).toBeVisible(),
		);
	},
};

export const CalendarOpen: Story = {
	args: {
		data: dataOf({ from: "2026-10-05", to: "2026-10-21", preset: null }),
	},
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
	args: { data: dataOf(valueOfPreset(LAST_90)) },
};

export const NoClosedDays: Story = {
	args: { data: null },
};

export const Narrow: Story = {
	globals: { viewport: { value: "mobile1", isRotated: false } },
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

export const AcrossYears: Story = {
	args: {
		data: dataOf({ from: "2025-12-20", to: "2026-01-09", preset: null }),
	},
};

export const Keyboard: Story = {
	play: async ({ canvasElement, args }) => {
		const trigger = within(canvasElement).getByRole("button");
		await userEvent.tab();
		await expect(trigger).toHaveFocus();
		await userEvent.keyboard("{Enter}");
		await within(document.body).findByRole("menu");
		await userEvent.keyboard("{Enter}");
		await waitFor(() =>
			expect(args.onChange).toHaveBeenLastCalledWith(valueOfPreset(LAST_7)),
		);
		await waitFor(() => expect(trigger).toHaveFocus());
		await userEvent.keyboard("{Enter}");
		await within(document.body).findByRole("menu");
		await userEvent.keyboard("{End}{Enter}");
		await waitFor(() =>
			expect(within(document.body).getAllByRole("grid")).not.toHaveLength(0),
		);
		await userEvent.keyboard("{Escape}");
		await waitFor(() => expect(trigger).toHaveFocus());
	},
};

export const TwoCustomRangesInARow: Story = {
	play: async ({ canvasElement, args }) => {
		const day = (iso: string) =>
			document.body.querySelector<HTMLElement>(`td[data-day="${iso}"] button`);
		const pick = async (from: string, to: string) => {
			await userEvent.click(within(canvasElement).getByRole("button"));
			await userEvent.click(
				await within(document.body).findByText(/Custom range/),
			);
			await waitFor(() => expect(day(from)).not.toBeNull());
			await userEvent.click(day(from) as HTMLElement);
			await userEvent.click(day(to) as HTMLElement);
		};
		await pick("2026-10-06", "2026-10-10");
		await waitFor(() =>
			expect(args.onChange).toHaveBeenLastCalledWith({
				from: "2026-10-06",
				to: "2026-10-10",
				preset: null,
			}),
		);
		await pick("2026-10-13", "2026-10-15");
		await waitFor(() =>
			expect(args.onChange).toHaveBeenLastCalledWith({
				from: "2026-10-13",
				to: "2026-10-15",
				preset: null,
			}),
		);
	},
};
