import { GlobalRegistrator } from "@happy-dom/global-registrator";

const alreadyRegistered = GlobalRegistrator.isRegistered;
if (!alreadyRegistered) GlobalRegistrator.register();
(
	globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

const { afterAll, afterEach, describe, expect, mock, test } = await import(
	"bun:test"
);
const { act, cleanup, fireEvent, render } = await import(
	"@testing-library/react"
);
const { SpanFields } = await import("./SpanFields");

afterEach(cleanup);
afterAll(async () => {
	if (!alreadyRegistered) await GlobalRegistrator.unregister();
});

const LA = "America/Los_Angeles";
const TEN_TO_QUARTER_TO_ELEVEN = {
	start: "2037-10-06T17:00:00.000Z",
	end: "2037-10-06T17:45:00.000Z",
};

function mount(value = TEN_TO_QUARTER_TO_ELEVEN) {
	const onChange = mock();
	const view = render(
		<SpanFields value={value} timeZone={LA} onChange={onChange} />,
	);
	const open = (name: string) =>
		act(async () => {
			// A popover that just closed swallows a click made in the same tick.
			await new Promise((resolve) => setTimeout(resolve, 50));
			fireEvent.click(view.getByRole("button", { name }));
		});
	const options = () =>
		view.getAllByRole("option").map((option) => option.textContent ?? "");
	return { ...view, onChange, open, options };
}

describe("SpanFields, as Google's Starts and Ends", () => {
	test("the fields read the date and time in the zone", () => {
		const fields = mount();
		expect(
			fields
				.getAllByRole("button")
				.map((button) => button.textContent?.replace(/\s/g, " ")),
		).toEqual(["Oct 6, 2037", "10:00 AM", "Oct 6, 2037", "10:45 AM"]);
	});

	test("the start list is every quarter hour of the day, with the current time chosen", async () => {
		const fields = mount();
		await fields.open("Start time");
		const times = fields.options();
		expect(times).toHaveLength(96);
		expect(times[0]).toMatch(/^12:00\sAM$/);
		expect(times[1]).toMatch(/^12:15\sAM$/);
		expect(times.at(-1)).toMatch(/^11:45\sPM$/);
		expect(fields.getByRole("option", { selected: true }).textContent).toMatch(
			/^10:00\sAM$/,
		);
	});

	test("the end list starts at the start and carries the length: quarter hours for an hour, then half hours", async () => {
		const fields = mount();
		await fields.open("End time");
		const times = fields.options().map((time) => time.replace(/\s/g, " "));
		expect(times).toHaveLength(50);
		expect(times.slice(0, 6)).toEqual([
			"10:00 AM (0 min)",
			"10:15 AM (15 min)",
			"10:30 AM (30 min)",
			"10:45 AM (45 min)",
			"11:00 AM (1 hr)",
			"11:30 AM (1.5 hr)",
		]);
		expect(times.at(-1)).toBe("9:30 AM (23.5 hr)");
		expect(
			fields
				.getByRole("option", { selected: true })
				.textContent?.replace(/\s/g, " "),
		).toBe("10:45 AM (45 min)");
	});

	test("a new start keeps the length; a new end changes it", async () => {
		const fields = mount();
		await fields.open("Start time");
		await act(async () => {
			fireEvent.click(fields.getByRole("option", { name: /^9:00\sAM/ }));
		});
		await fields.open("End time");
		await act(async () => {
			fireEvent.click(fields.getByRole("option", { name: /^11:30\sAM/ }));
		});
		expect(fields.onChange.mock.calls).toEqual([
			[{ start: "2037-10-06T16:00:00.000Z", end: "2037-10-06T16:45:00.000Z" }],
			[{ start: "2037-10-06T17:00:00.000Z", end: "2037-10-06T18:30:00.000Z" }],
		]);
	});

	test("a day picked from the month moves the start and keeps the time", async () => {
		const fields = mount();
		await fields.open("Start date");
		await act(async () => {
			fireEvent.click(
				fields.getByRole("button", { name: /^Thursday, October 8th/ }),
			);
		});
		expect(fields.onChange.mock.calls).toEqual([
			[{ start: "2037-10-08T17:00:00.000Z", end: "2037-10-08T17:45:00.000Z" }],
		]);
	});

	test("an end on another day lists the whole day with no lengths", async () => {
		const fields = mount({
			start: "2037-10-06T17:00:00.000Z",
			end: "2037-10-07T17:00:00.000Z",
		});
		await fields.open("End time");
		expect(fields.options()).toHaveLength(96);
		expect(fields.options()[0]).toMatch(/^12:00\sAM$/);
	});

	test("a time off the quarter hour is still listed", async () => {
		const fields = mount({
			start: "2037-10-06T17:10:00.000Z",
			end: "2037-10-06T17:45:00.000Z",
		});
		await fields.open("Start time");
		expect(fields.getByRole("option", { selected: true }).textContent).toMatch(
			/^10:10\sAM$/,
		);
		expect(fields.options()).toHaveLength(97);
	});
});
