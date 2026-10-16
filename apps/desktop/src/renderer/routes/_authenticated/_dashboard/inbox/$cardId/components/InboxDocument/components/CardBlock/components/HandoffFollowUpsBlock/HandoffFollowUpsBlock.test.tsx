import { slackTestKit } from "../slackTestKit";

const kit = await slackTestKit();
const { describe, expect, test } = await import("bun:test");
const fx = await import("../handoffFixtures");
const linear = await import("../linearFixtures");
const { HandoffFollowUpsBlock } = await import("./HandoffFollowUpsBlock");

type Props = Parameters<typeof HandoffFollowUpsBlock>[0];
const mount = (props: Partial<Props> = {}) =>
	kit.mount(HandoffFollowUpsBlock, {
		view: fx.followUpsView,
		actions: fx.followUpsActions,
		...props,
	});

const GMAIL = {
	id: "pricing",
	gmail: {
		to: ["dana.whitfield@northwind.example"],
		subject: "Updated pricing sheet",
		body: "Hi Dana,\n\nThe updated pricing sheet is attached to the shared folder.\n\nRiley",
	},
};
const LINEAR = {
	id: "retry",
	linear: {
		team: linear.team.id,
		title: "Add a retry to the export job",
		description: 'From the meeting "Weekly product sync".',
		fields: fx.followUpDraft.fields,
	},
};
const SLACK = {
	id: "notes",
	slack: { to: "C0TESTAGNT1", text: "The launch moves to *October 14*." },
};
const toggle = (block: ReturnType<typeof mount>, name: RegExp) =>
	kit.act(async () => {
		kit.fireEvent.click(block.getByRole("checkbox", { name }));
	});

describe("header", () => {
	test("the meeting, where its notes came from, when, and the way to them", () => {
		const block = mount();
		expect(block.getByText("Weekly product sync")).toBeTruthy();
		expect(block.getByText("Granola")).toBeTruthy();
		expect(
			block.container.querySelector("time")?.getAttribute("datetime"),
		).toBe("2037-09-30T17:00:00.000Z");
		expect(
			(block.getByRole("link", { name: "Open notes" }) as HTMLAnchorElement)
				.href,
		).toBe("https://notes.lumenlabs.example/weekly-product-sync");
	});

	test("plain notes with no link and no time", () => {
		const block = mount({
			view: {
				...fx.followUpsView,
				source: "notes",
				meeting: { title: "Hallway chat", url: null, heldAt: null },
			},
		});
		expect(block.getByText("Notes")).toBeTruthy();
		expect(block.queryByRole("link", { name: "Open notes" })).toBeNull();
		expect(block.container.querySelector("time")).toBeNull();
	});
});

describe("route", () => {
	test("the question lists every write in order, and each goes with one destination", async () => {
		const block = mount();
		await block.click("Route 3 items");
		expect(block.onAct).not.toHaveBeenCalled();
		expect(block.question()).toBe(
			'Make a Gmail draft to dana.whitfield@northwind.example, then file "Add a retry to the export job" in Agent Test, then send a Slack message to test-agents?',
		);
		await block.confirm();
		expect(block.onAct.mock.calls).toEqual([
			["route", { items: [GMAIL, LINEAR, SLACK] }],
		]);
	});

	test("an unchecked row is left out of the count, the question and the payload", async () => {
		const block = mount();
		await toggle(block, /Add a retry/);
		await block.click("Route 2 items");
		expect(block.question()).toBe(
			"Make a Gmail draft to dana.whitfield@northwind.example, then send a Slack message to test-agents?",
		);
		await block.confirm();
		expect(block.onAct.mock.calls).toEqual([
			["route", { items: [GMAIL, SLACK] }],
		]);
	});

	test("nothing checked: the button is off", async () => {
		const block = mount();
		await toggle(block, /Send Dana/);
		await toggle(block, /Add a retry/);
		expect(block.button("Route 1 item").disabled).toBe(false);
		await toggle(block, /Share the launch date/);
		expect(block.button("Route 0 items").disabled).toBe(true);
	});

	test("the reader's title is in the question and the payload", async () => {
		const block = mount();
		await block.click("Linear issue in Agent Test");
		await block.type("Title", "Retry three times ");
		await block.click("Route 3 items");
		expect(block.question()).toBe(
			'Make a Gmail draft to dana.whitfield@northwind.example, then file "Retry three times" in Agent Test, then send a Slack message to test-agents?',
		);
		await block.confirm();
		expect(block.onAct.mock.calls[0]?.[1]).toEqual({
			items: [
				GMAIL,
				{ ...LINEAR, linear: { ...LINEAR.linear, title: "Retry three times" } },
				SLACK,
			],
		});
	});

	test("a checked row with nothing to send holds the button", async () => {
		const block = mount();
		await block.click("Linear issue in Agent Test");
		await block.type("Title", "");
		expect(block.button("Route 3 items").disabled).toBe(true);
	});

	test("an edited Slack message goes out with its blocks", async () => {
		const block = mount();
		await block.click(/Slack message/);
		await kit.write(kit.editors()[0], "Launch is the 14th");
		await block.click("Route 3 items");
		await block.confirm();
		const items = (block.onAct.mock.calls[0]?.[1] as { items: unknown[] })
			.items;
		expect(items[2]).toMatchObject({
			id: "notes",
			slack: { to: "C0TESTAGNT1", text: "Launch is the 14th" },
		});
		expect(JSON.stringify(items[2])).toContain('"type":"rich_text"');
	});

	test("Route nothing dismisses with no question", async () => {
		const block = mount();
		await block.click("Route nothing");
		expect(block.question()).toBeNull();
		expect(block.onAct.mock.calls).toEqual([["dismiss"]]);
	});
});

describe("partly routed", () => {
	const partly = (props: Partial<Props> = {}) =>
		mount({
			view: fx.partlyRoutedView,
			actions: fx.partlyRoutedActions,
			...props,
		});

	test("only the row that is left is checked, asked about and sent", async () => {
		const block = partly();
		expect(block.getAllByRole("checkbox")).toHaveLength(1);
		expect(
			block.getByRole("link", { name: "Filed AGT-12 in Agent Test" }),
		).toBeTruthy();
		await block.click("Route 1 item");
		expect(block.question()).toBe("Send a Slack message to test-agents?");
		await block.confirm();
		expect(block.onAct.mock.calls).toEqual([["route", { items: [SLACK] }]]);
	});

	test("the way out reads Done", async () => {
		const block = partly();
		expect(block.queryByRole("button", { name: "Route nothing" })).toBeNull();
		await block.click("Done");
		expect(block.onAct.mock.calls).toEqual([["dismiss"]]);
	});

	test("when the server sends the items back with two done, they leave the checked set and the edit stays", async () => {
		const block = mount();
		await block.click(/Slack message/);
		await kit.write(kit.editors()[0], "Launch is the 14th");
		const again = (view: Props["view"], actions: Props["actions"]) =>
			kit.act(async () => {
				block.rerender(
					<kit.TooltipProvider>
						<HandoffFollowUpsBlock
							view={view}
							actions={actions}
							done={false}
							pending={false}
							failure="Slack did not answer. Try again"
							onAct={block.onAct}
						/>
					</kit.TooltipProvider>,
				);
			});
		await again(fx.partlyRoutedView, fx.partlyRoutedActions);
		expect(block.getByRole("alert").textContent).toBe(
			"Slack did not answer. Try again",
		);
		expect(block.getAllByRole("checkbox")).toHaveLength(1);
		await block.click("Route 1 item");
		await block.confirm();
		const sent = block.onAct.mock.calls[0]?.[1] as { items: { id: string }[] };
		expect(sent.items).toHaveLength(1);
		expect(sent.items[0]).toMatchObject({
			id: "notes",
			slack: { to: "C0TESTAGNT1", text: "Launch is the 14th" },
		});
	});

	test("another meeting starts from its own items", async () => {
		const block = mount();
		await toggle(block, /Send Dana/);
		await kit.act(async () => {
			block.rerender(
				<kit.TooltipProvider>
					<HandoffFollowUpsBlock
						view={{
							...fx.followUpsView,
							meeting: { ...fx.followUpsView.meeting, title: "Design review" },
						}}
						actions={fx.followUpsActions}
						done={false}
						pending={false}
						failure={null}
						onAct={block.onAct}
					/>
				</kit.TooltipProvider>,
			);
		});
		expect(block.button("Route 3 items")).toBeTruthy();
	});
});

describe("the rest", () => {
	test("unavailable rows are not sent", async () => {
		const block = mount({
			view: { ...fx.followUpsView, items: fx.unavailableItems },
		});
		await block.click("Route 1 item");
		expect(block.question()).toBe(
			'File "Add a retry to the export job" in Agent Test?',
		);
		await block.confirm();
		expect(block.onAct.mock.calls).toEqual([["route", { items: [LINEAR] }]]);
	});

	test("an action the reader may not take is off", () => {
		const block = mount({
			actions: [
				{ ...fx.followUpsActions[0], disabled: "Linear is not connected" },
				fx.followUpsActions[1],
			] as Props["actions"],
		});
		expect(block.button("Route 3 items").disabled).toBe(true);
	});

	test("done: every row finished and nothing to press", () => {
		const block = mount({
			view: { ...fx.followUpsView, items: fx.allRoutedItems },
			done: true,
		});
		expect(block.queryAllByRole("checkbox")).toEqual([]);
		expect(block.queryByRole("button", { name: /Route|Done/ })).toBeNull();
		expect(block.getAllByRole("link").map((link) => link.textContent)).toEqual([
			"Open notes",
			"Made a Gmail draft to dana.whitfield@northwind.example",
			"Filed AGT-12 in Agent Test",
		]);
	});

	test("done with rows never sent: they read unchecked", () => {
		const block = mount({ done: true });
		expect(
			block
				.getAllByRole("checkbox")
				.map((each) => each.getAttribute("aria-checked")),
		).toEqual(["false", "false", "false"]);
	});
});
