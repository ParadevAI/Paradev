import { slackTestKit } from "../slackTestKit";

const kit = await slackTestKit();
const { describe, expect, test } = await import("bun:test");
const fx = await import("../slackApprovalFixtures");
const { SlackReminderBlock } = await import("./SlackReminderBlock");

type Props = Parameters<typeof SlackReminderBlock>[0];
const mount = (props: Partial<Props> = {}) =>
	kit.mount(SlackReminderBlock, {
		view: fx.reminderView,
		actions: fx.reminderActions,
		...props,
	});

describe("reminder", () => {
	test("opens on the agent's words and time, and sets it with no dialog", async () => {
		const block = mount();
		expect(
			(block.getByLabelText("Description") as HTMLTextAreaElement).value,
		).toBe("Send the invoice to Northwind");
		expect(block.button("Reminder date").textContent).toBe("Oct 2, 2037");
		expect(block.button("Reminder time").textContent).toBe("9:00 AM");
		expect(block.getByText("You")).toBeTruthy();
		await block.click("Set reminder");
		expect(block.question()).toBeNull();
		expect(block.onAct.mock.calls).toEqual([
			[
				"remind",
				{
					text: "Send the invoice to Northwind",
					time: "2037-10-02T16:00:00.000Z",
				},
			],
		]);
	});

	test("edited words and a picked time, in the reader's Slack zone", async () => {
		const block = mount({
			view: { ...fx.reminderView, timezone: "Asia/Tokyo" },
		});
		expect(block.button("Reminder date").textContent).toBe("Oct 3, 2037");
		expect(block.button("Reminder time").textContent).toBe("1:00 AM");
		await block.type("Description", "  Chase the invoice ");
		await block.click("Reminder time");
		await kit.option("8:30 AM");
		await block.click("Set reminder");
		expect(block.onAct.mock.calls).toEqual([
			[
				"remind",
				{ text: "Chase the invoice", time: "2037-10-02T23:30:00.000Z" },
			],
		]);
	});

	test("no time proposed: tomorrow at 9:00", () => {
		const block = mount({ view: { ...fx.reminderView, time: null } });
		expect(block.button("Reminder date").textContent).toBe("Oct 2, 2037");
		expect(block.button("Reminder time").textContent).toBe("9:00 AM");
	});

	test("a time that has passed is refused", async () => {
		const block = mount({
			view: { ...fx.reminderView, time: "2037-10-01T18:00:00.000Z" },
		});
		expect(block.getByText("Pick a time in the future")).toBeTruthy();
		expect(block.button("Set reminder").disabled).toBe(true);
		await block.click("Reminder time");
		await kit.option("12:15 PM");
		expect(block.queryByText("Pick a time in the future")).toBeNull();
		expect(block.button("Set reminder").disabled).toBe(false);
	});

	test("the agent's time had passed when the card was read", () => {
		const block = mount({
			view: { ...fx.reminderView, time: null, stale: true },
		});
		expect(block.getByText("The proposed time has passed")).toBeTruthy();
	});

	test("no words: the button is off", async () => {
		const block = mount();
		await block.type("Description", "   ");
		expect(block.button("Set reminder").disabled).toBe(true);
	});

	test("no reminder", async () => {
		const block = mount();
		await block.click("No reminder");
		expect(block.onAct.mock.calls).toEqual([["dismiss"]]);
	});
});

describe("states", () => {
	test("settled: the words and the time, with no controls", () => {
		const block = mount({ done: true });
		expect(block.getByText("Send the invoice to Northwind")).toBeTruthy();
		expect(block.getByText("Oct 2 at 9:00 AM")).toBeTruthy();
		expect(block.queryByRole("button")).toBeNull();
		expect(block.queryByRole("textbox")).toBeNull();
	});

	test("pending: the controls are off", () => {
		const block = mount({ pending: true });
		expect(block.button("Set reminder").disabled).toBe(true);
		expect(block.button("No reminder").disabled).toBe(true);
		expect(block.button("Reminder date").disabled).toBe(true);
		expect(
			(block.getByLabelText("Description") as HTMLTextAreaElement).disabled,
		).toBe(true);
	});

	test("failure is an alert", () => {
		const block = mount({ failure: "Slack reminds up to 5 years ahead" });
		expect(block.getByRole("alert").textContent).toBe(
			"Slack reminds up to 5 years ahead",
		);
	});
});
