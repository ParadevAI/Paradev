import { slackTestKit } from "../slackTestKit";

const kit = await slackTestKit();
const { describe, expect, test } = await import("bun:test");
const fx = await import("../slackApprovalFixtures");
const { SlackStatusBlock } = await import("./SlackStatusBlock");

type Props = Parameters<typeof SlackStatusBlock>[0];
const mount = (props: Partial<Props> = {}) =>
	kit.mount(SlackStatusBlock, {
		view: fx.statusView,
		actions: fx.statusActions,
		...props,
	});
const pause = (props: Partial<Props> = {}) =>
	mount({ view: fx.pauseView, actions: fx.pauseActions, ...props });
const CLEAR = "Duration";
const checkbox = (block: ReturnType<typeof mount>) =>
	block.getByRole("checkbox", {
		name: "Pause notifications until status is cleared",
	}) as HTMLButtonElement;

describe("set a status", () => {
	test("the agent's status, end time and pause, stated before it is set", async () => {
		const block = mount();
		expect((block.getByLabelText("Status") as HTMLInputElement).value).toBe(
			"Heads down",
		);
		expect(block.button("Status emoji").textContent).toBe("🎧");
		expect((block.getByLabelText(CLEAR) as HTMLSelectElement).value).toBe(
			"custom",
		);
		expect(block.button("Clear date").textContent).toBe("Oct 2, 2037");
		expect(block.button("Clear time").textContent).toBe("4:00 PM");
		expect(checkbox(block).getAttribute("aria-checked")).toBe("true");
		expect(block.queryByText("Current status")).toBeNull();

		await block.click("Set status");
		expect(block.onAct).not.toHaveBeenCalled();
		expect(block.question()).toBe(
			"Set your Slack status to 🎧 Heads down until Oct 2 at 4:00 PM and pause notifications?",
		);
		await block.confirm();
		expect(block.onAct.mock.calls).toEqual([
			[
				"set_status",
				{
					text: "Heads down",
					emoji: ":headphones:",
					until: "2037-10-02T23:00:00.000Z",
					pause: true,
				},
			],
		]);
	});

	test("without the pause", async () => {
		const block = mount();
		await kit.act(async () => {
			kit.fireEvent.click(checkbox(block));
		});
		await block.click("Set status");
		expect(block.question()).toBe(
			"Set your Slack status to 🎧 Heads down until Oct 2 at 4:00 PM?",
		);
		await block.confirm();
		expect(block.onAct.mock.calls[0]?.[1]).toMatchObject({ pause: false });
	});

	test("a status that does not clear cannot pause notifications", async () => {
		const block = mount();
		await block.type(CLEAR, "never");
		expect(checkbox(block).disabled).toBe(true);
		expect(checkbox(block).getAttribute("aria-checked")).toBe("false");
		expect(block.queryByRole("button", { name: "Clear date" })).toBeNull();
		await block.click("Set status");
		expect(block.question()).toBe("Set your Slack status to 🎧 Heads down?");
		await block.confirm();
		expect(block.onAct.mock.calls).toEqual([
			[
				"set_status",
				{
					text: "Heads down",
					emoji: ":headphones:",
					until: null,
					pause: false,
				},
			],
		]);
	});

	test("Slack's durations, from now", async () => {
		const until = async (choice: string) => {
			const block = mount();
			await block.type(CLEAR, choice);
			await block.click("Set status");
			const question = block.question();
			await block.confirm();
			const sent = block.onAct.mock.calls[0]?.[1] as { until: string };
			kit.cleanup();
			return [question, sent.until];
		};
		expect(await until("30m")).toEqual([
			"Set your Slack status to 🎧 Heads down until Oct 1 at 12:30 PM and pause notifications?",
			"2037-10-01T19:30:00.000Z",
		]);
		expect((await until("1h"))[1]).toBe("2037-10-01T20:00:00.000Z");
		expect((await until("4h"))[1]).toBe("2037-10-01T23:00:00.000Z");
		expect((await until("today"))[1]).toBe("2037-10-02T07:00:00.000Z");
		expect((await until("week"))[1]).toBe("2037-10-05T07:00:00.000Z");
	});

	test("a workspace emoji and no end", async () => {
		const block = mount({ view: fx.statusForeverView });
		expect((block.getByLabelText(CLEAR) as HTMLSelectElement).value).toBe(
			"never",
		);
		expect(
			block.button("Status emoji").querySelector("img")?.getAttribute("src"),
		).toBe(fx.statusForeverView.emoji.shipit);
		await block.click("Set status");
		expect(block.question()).toBe(
			"Set your Slack status to :shipit: Shipping?",
		);
	});

	test("words only, and an emoji only", async () => {
		const block = mount({
			view: {
				...fx.statusForeverView,
				proposed: { ...fx.statusForeverView.proposed, emoji: "" },
			},
		});
		await block.type("Status", "  Out sick ");
		await block.click("Set status");
		expect(block.question()).toBe("Set your Slack status to Out sick?");
		await block.confirm();
		expect(block.onAct.mock.calls[0]?.[1]).toEqual({
			text: "Out sick",
			emoji: "",
			until: null,
			pause: false,
		});
		kit.cleanup();

		const glyph = mount();
		await glyph.type("Status", "");
		await glyph.type(CLEAR, "never");
		await glyph.click("Set status");
		expect(glyph.question()).toBe("Set your Slack status to 🎧?");
	});

	test("neither words nor emoji: the button is off", async () => {
		const block = mount({
			view: {
				...fx.statusForeverView,
				proposed: { ...fx.statusForeverView.proposed, emoji: "", text: "" },
			},
		});
		expect(block.button("Set status").disabled).toBe(true);
	});

	test("an emoji is picked from Slack's picker", async () => {
		const block = mount();
		await block.click("Status emoji");
		await kit.act(async () => {
			kit.fireEvent.change(
				document.body.querySelector(
					'input[placeholder="Search all emoji"]',
				) as HTMLElement,
				{ target: { value: "palm_tree" } },
			);
		});
		await kit.act(async () => {
			kit.fireEvent.keyDown(
				document.body.querySelector(
					'input[placeholder="Search all emoji"]',
				) as HTMLElement,
				{ key: "Enter" },
			);
		});
		expect(block.button("Status emoji").textContent).toBe("🌴");
		await block.click("Set status");
		await block.confirm();
		expect(block.onAct.mock.calls[0]?.[1]).toMatchObject({
			emoji: ":palm_tree:",
		});
	});

	test("an end time that has passed is refused", () => {
		const block = mount({
			view: {
				...fx.statusView,
				proposed: {
					...fx.statusView.proposed,
					until: "2037-10-01T18:00:00.000Z",
				},
			},
		});
		expect(block.getByText("Pick a time in the future")).toBeTruthy();
		expect(block.button("Set status").disabled).toBe(true);
	});

	test("the current status is shown, and cleared with the server's question", async () => {
		const block = mount({
			view: fx.statusWithCurrentView,
			actions: [...fx.statusActions, fx.clearStatusAction],
		});
		expect(block.getByText("Current status")).toBeTruthy();
		expect(block.getByText("In a meeting")).toBeTruthy();
		expect(block.getByText("until Oct 2 at 9:00 AM")).toBeTruthy();
		await block.click("Clear status");
		expect(block.question()).toBe("Clear your Slack status?");
		await block.confirm();
		expect(block.onAct.mock.calls).toEqual([["clear_status"]]);
	});

	test("no clear button unless the server offers it", () => {
		const block = mount({ view: fx.statusWithCurrentView });
		expect(block.queryByRole("button", { name: "Clear status" })).toBeNull();
	});
});

describe("pause notifications", () => {
	test("the agent's time, stated before it is set", async () => {
		const block = pause();
		expect(
			block.getByRole("radio", { name: "Custom" }).getAttribute("aria-checked"),
		).toBe("true");
		expect(block.button("Pause until date").textContent).toBe("Oct 2, 2037");
		expect(block.button("Pause until time").textContent).toBe("4:00 PM");
		await block.click("Pause notifications");
		expect(block.question()).toBe(
			"Pause your Slack notifications until Oct 2 at 4:00 PM?",
		);
		await block.confirm();
		expect(block.onAct.mock.calls).toEqual([
			["pause", { until: "2037-10-02T23:00:00.000Z" }],
		]);
	});

	test("Slack's durations, and until tomorrow", async () => {
		const until = async (choice: string) => {
			const block = pause();
			await block.choose(choice);
			await block.click("Pause notifications");
			const question = block.question();
			await block.confirm();
			const sent = block.onAct.mock.calls[0]?.[1] as { until: string };
			kit.cleanup();
			return [question, sent.until];
		};
		expect(await until("For 30 minutes")).toEqual([
			"Pause your Slack notifications until Oct 1 at 12:30 PM?",
			"2037-10-01T19:30:00.000Z",
		]);
		expect((await until("For 1 hour"))[1]).toBe("2037-10-01T20:00:00.000Z");
		expect((await until("For 2 hours"))[1]).toBe("2037-10-01T21:00:00.000Z");
		expect(await until("Until tomorrow")).toEqual([
			"Pause your Slack notifications until Oct 2 at 9:00 AM?",
			"2037-10-02T16:00:00.000Z",
		]);
	});

	test("no time proposed: 30 minutes", () => {
		const block = pause({
			view: {
				...fx.pauseView,
				proposed: { ...fx.pauseView.proposed, pauseUntil: null },
			},
		});
		expect(
			block
				.getByRole("radio", { name: "For 30 minutes" })
				.getAttribute("aria-checked"),
		).toBe("true");
	});

	test("a time that has passed is refused", () => {
		const block = pause({
			view: {
				...fx.pauseView,
				proposed: {
					...fx.pauseView.proposed,
					pauseUntil: "2037-10-01T18:00:00.000Z",
				},
			},
		});
		expect(block.getByText("Pick a time in the future")).toBeTruthy();
		expect(block.button("Pause notifications").disabled).toBe(true);
	});

	test("a pause that is on is shown, and resumed with the server's question", async () => {
		const block = pause({
			view: fx.pausedView,
			actions: [...fx.pauseActions, fx.resumeAction],
		});
		expect(
			block.getByText("Notifications are paused until Oct 2 at 9:00 AM"),
		).toBeTruthy();
		await block.click("Resume notifications");
		expect(block.question()).toBe("Resume your Slack notifications now?");
		await block.confirm();
		expect(block.onAct.mock.calls).toEqual([["resume"]]);
	});
});

describe("states", () => {
	test("leave it, in both modes", async () => {
		for (const open of [mount, pause]) {
			const block = open();
			await block.click("Leave it");
			expect(block.onAct.mock.calls).toEqual([["dismiss"]]);
			kit.cleanup();
		}
	});

	test("settled: what was proposed, with no controls", () => {
		const status = mount({ done: true });
		expect(status.getByText("Heads down")).toBeTruthy();
		expect(status.queryByRole("button")).toBeNull();
		expect(status.queryByRole("textbox")).toBeNull();
		kit.cleanup();
		const paused = pause({ done: true });
		expect(
			paused.getByText("Pause notifications until Oct 2 at 4:00 PM"),
		).toBeTruthy();
		expect(paused.queryByRole("button")).toBeNull();
		expect(paused.queryByRole("radio")).toBeNull();
	});

	test("pending: the controls are off", () => {
		const block = mount({ pending: true });
		expect(block.button("Set status").disabled).toBe(true);
		expect(block.button("Leave it").disabled).toBe(true);
		expect(block.button("Status emoji").disabled).toBe(true);
		expect((block.getByLabelText("Status") as HTMLInputElement).disabled).toBe(
			true,
		);
		expect((block.getByLabelText(CLEAR) as HTMLSelectElement).disabled).toBe(
			true,
		);
	});

	test("failure is an alert", () => {
		const block = mount({ failure: "Pick a time within a year" });
		expect(block.getByRole("alert").textContent).toBe(
			"Pick a time within a year",
		);
	});

	test("the agent's time had passed when the card was read", () => {
		const block = mount({ view: { ...fx.statusForeverView, stale: true } });
		expect(block.getByText("The proposed time has passed")).toBeTruthy();
	});
});
