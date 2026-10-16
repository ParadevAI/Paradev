import { GlobalRegistrator } from "@happy-dom/global-registrator";

const alreadyRegistered = GlobalRegistrator.isRegistered;
if (!alreadyRegistered) GlobalRegistrator.register();
(
	globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

const { afterAll, afterEach, describe, expect, mock, test } = await import(
	"bun:test"
);
mock.module("renderer/lib/clickPolicy", () => ({
	useUrlLinkAction: () => () => null,
}));
mock.module("renderer/lib/electron-trpc", () => ({
	electronTrpc: {
		createClient: () => ({}),
		external: { openUrl: { useMutation: () => ({ mutate: () => {} }) } },
	},
}));
const actualRouter = await import("@tanstack/react-router");
mock.module("@tanstack/react-router", () => ({
	...actualRouter,
	useNavigate: () => () => {},
}));
const { act, cleanup, fireEvent, render } = await import(
	"@testing-library/react"
);
const { useState } = await import("react");
const { busy, slots, week, ZONE } = await import("../calendarFixtures");
const { HOUR_PX } = await import("./constants");
const { SlotPicker } = await import("./SlotPicker");

import type { CalendarSpan } from "../../types";

afterEach(cleanup);
afterAll(async () => {
	if (!alreadyRegistered) await GlobalRegistrator.unregister();
});

type Props = Parameters<typeof SlotPicker>[0];

function mount(overrides: Partial<Props> = {}) {
	const onChange = mock();
	function Harness() {
		const [value, setValue] = useState<CalendarSpan[]>(overrides.value ?? []);
		return (
			<SlotPicker
				window={week}
				timeZone={ZONE}
				busy={busy}
				minutes={30}
				mode="single"
				{...overrides}
				value={value}
				onChange={(next) => {
					setValue(next);
					onChange(next);
				}}
			/>
		);
	}
	const view = render(<Harness />);
	const clickAt = (day: RegExp, hour: number, extraPx = 0) =>
		act(async () => {
			fireEvent.click(view.getByLabelText(day), {
				clientY: hour * HOUR_PX + extraPx,
				detail: 1,
			});
		});
	const selections = () =>
		[...view.container.querySelectorAll("button[aria-pressed='true']")].map(
			(button) => button.getAttribute("aria-label"),
		);
	return { ...view, onChange, clickAt, selections };
}

const tuesday = /Pick a time on Tuesday, October 6/;
const free: CalendarSpan = {
	start: "2037-10-06T20:00:00.000Z",
	end: "2037-10-06T20:30:00.000Z",
};

describe("picking a time", () => {
	test("a click on empty time picks the length from the quarter hour under it, in the view's zone", async () => {
		const picker = mount();
		await picker.clickAt(tuesday, 13, 10);
		expect(picker.onChange).toHaveBeenLastCalledWith([free]);
		expect(picker.selections()).toEqual([
			"Tue, Oct 6, 1:00 – 1:30 PM PDT, selected",
		]);
	});

	test("the same click in another zone is another instant", async () => {
		const picker = mount({ timeZone: "Asia/Tokyo", busy: [] });
		await picker.clickAt(/Pick a time on Tuesday, October 6/, 13);
		expect(picker.onChange).toHaveBeenLastCalledWith([
			{ start: "2037-10-06T04:00:00.000Z", end: "2037-10-06T04:30:00.000Z" },
		]);
	});

	test("single mode replaces the pick; multiple mode adds to it in time order", async () => {
		const single = mount({ value: [free] });
		await single.clickAt(tuesday, 15);
		expect(single.onChange.mock.calls.at(-1)?.[0]).toHaveLength(1);
		cleanup();

		const multiple = mount({ mode: "multiple", value: [free] });
		await multiple.clickAt(tuesday, 8);
		expect(multiple.onChange.mock.calls.at(-1)?.[0]).toEqual([
			{ start: "2037-10-06T15:00:00.000Z", end: "2037-10-06T15:30:00.000Z" },
			free,
		]);
	});

	test("a key press on a day picks nine o'clock", async () => {
		const picker = mount({ busy: [] });
		await act(async () => {
			fireEvent.click(picker.getByLabelText(tuesday), { detail: 0 });
		});
		expect(picker.selections()).toEqual([
			"Tue, Oct 6, 9:00 – 9:30 AM PDT, selected",
		]);
	});
});

describe("suggested times", () => {
	test("a suggestion is a button; in multiple mode it toggles", async () => {
		const picker = mount({ mode: "multiple", slots });
		const suggestion = picker.getByLabelText(
			"Tue, Oct 6, 11:30 AM – 12:00 PM PDT, suggested time",
		);
		await act(async () => {
			fireEvent.click(suggestion);
		});
		expect(picker.onChange).toHaveBeenLastCalledWith([slots[0]]);
		await act(async () => {
			fireEvent.click(
				picker.getByLabelText("Tue, Oct 6, 11:30 AM – 12:00 PM PDT, selected"),
			);
		});
		expect(picker.onChange).toHaveBeenLastCalledWith([]);
		expect(picker.selections()).toEqual([]);
	});
});

describe("conflicts", () => {
	test("a pick over the reader's events says which", () => {
		const picker = mount({
			value: [
				{
					start: "2037-10-06T10:00:00-07:00",
					end: "2037-10-06T10:45:00-07:00",
				},
			],
			busy: busy.filter((event) => event.id !== "evt_offsite_kickoff"),
		});
		expect(picker.selections()).toEqual([
			"Tue, Oct 6, 10:00 – 10:45 AM PDT, selected, conflicts with Standup, 2 Week planning, Dentist",
		]);
		expect(picker.container.querySelector("[data-conflict]")).not.toBeNull();
	});

	test("an event the reader declined is not a conflict, and is not drawn", () => {
		const picker = mount({
			value: [
				{
					start: "2037-10-07T16:00:00-07:00",
					end: "2037-10-07T16:30:00-07:00",
				},
			],
		});
		expect(picker.selections()).toEqual([
			"Wed, Oct 7, 4:00 – 4:30 PM PDT, selected",
		]);
		expect(picker.queryByText("Vendor demo")).toBeNull();
	});

	test("a guest's busy time is named on the pick", () => {
		const picker = mount({
			value: [free],
			guestsBusy: [
				{
					email: "avery@lumenlabs.io",
					busy: [
						{
							start: "2037-10-06T13:00:00-07:00",
							end: "2037-10-06T14:00:00-07:00",
						},
					],
				},
			],
		});
		expect(picker.selections()).toEqual([
			"Tue, Oct 6, 1:00 – 1:30 PM PDT, selected, a guest is busy",
		]);
	});
});

describe("keyboard", () => {
	test("arrows move a pick a quarter hour; Delete removes it", async () => {
		const picker = mount({ value: [free] });
		const selection = () =>
			picker.container.querySelector(
				"button[aria-pressed='true']",
			) as HTMLElement;
		await act(async () => {
			fireEvent.keyDown(selection(), { key: "ArrowDown" });
		});
		expect(picker.selections()).toEqual([
			"Tue, Oct 6, 1:15 – 1:45 PM PDT, selected",
		]);
		await act(async () => {
			fireEvent.keyDown(selection(), { key: "ArrowUp" });
		});
		await act(async () => {
			fireEvent.keyDown(selection(), { key: "ArrowUp" });
		});
		expect(picker.onChange).toHaveBeenLastCalledWith([
			{ start: "2037-10-06T19:45:00.000Z", end: "2037-10-06T20:15:00.000Z" },
		]);
		await act(async () => {
			fireEvent.keyDown(selection(), { key: "Delete" });
		});
		expect(picker.selections()).toEqual([]);
	});

	test("a pick does not move out of the window", async () => {
		const first = {
			start: "2037-10-05T00:00:00-07:00",
			end: "2037-10-05T00:30:00-07:00",
		};
		const picker = mount({ value: [first] });
		await act(async () => {
			fireEvent.keyDown(
				picker.container.querySelector(
					"button[aria-pressed='true']",
				) as HTMLElement,
				{ key: "ArrowUp" },
			);
		});
		expect(picker.onChange).not.toHaveBeenCalled();
	});
});

describe("the grid", () => {
	test("one column per day of the window, all-day events on top", () => {
		const picker = mount();
		expect(picker.getAllByLabelText(/^Pick a time on /)).toHaveLength(5);
		expect(picker.container.querySelector("[data-all-day]")?.textContent).toBe(
			"Offsite prep day",
		);
	});

	test("disabled turns every control off", () => {
		const picker = mount({ disabled: true, slots, value: [free] });
		const buttons = [...picker.container.querySelectorAll("button")];
		expect(buttons.length).toBeGreaterThan(0);
		expect(buttons.every((button) => button.disabled)).toBe(true);
	});
});
