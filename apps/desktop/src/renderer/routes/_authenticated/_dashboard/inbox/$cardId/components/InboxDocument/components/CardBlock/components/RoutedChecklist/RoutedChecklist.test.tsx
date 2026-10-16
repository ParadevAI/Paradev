import { slackTestKit } from "../slackTestKit";

const kit = await slackTestKit();
const { describe, expect, test } = await import("bun:test");
const { useState } = await import("react");
const fx = await import("../handoffFixtures");
const slack = await import("../slackApprovalFixtures");
const { RoutedChecklist } = await import("./RoutedChecklist");
const { routedSteps, routedValue } = await import("./utils/routedValue");

type Items = typeof fx.routedItems;
type Value = ReturnType<typeof routedValue>;

function mount(items: Items = fx.routedItems, disabled = false) {
	const seen: { value: Value } = { value: routedValue(items) };
	function Harness() {
		const [value, setValue] = useState(() => routedValue(items));
		seen.value = value;
		return (
			<kit.TooltipProvider>
				<RoutedChecklist
					items={items}
					compose={slack.compose}
					value={value}
					onChange={setValue}
					disabled={disabled}
				/>
			</kit.TooltipProvider>
		);
	}
	const view = kit.render(<Harness />);
	const box = (name: RegExp) =>
		view.getByRole("checkbox", { name }) as HTMLButtonElement;
	const checked = () =>
		view
			.getAllByRole("checkbox")
			.map((each) => each.getAttribute("aria-checked"));
	const press = (element: Element, key?: string) =>
		kit.act(async () => {
			if (key) kit.fireEvent.keyDown(element, { key });
			else kit.fireEvent.click(element);
		});
	const row = (id: string) =>
		view.container.querySelector(`[data-routed-item="${id}"]`) as HTMLElement;
	const steps = () => routedSteps(items, seen.value).map((step) => step.input);
	return { ...view, box, checked, press, row, steps };
}

describe("rows", () => {
	test("every open row is checked, with its owner and where it goes", () => {
		const list = mount();
		expect(list.checked()).toEqual(["true", "true", "true"]);
		expect(list.getByText("Riley")).toBeTruthy();
		expect(
			list.getByRole("button", {
				name: "Gmail draft to dana.whitfield@northwind.example",
			}),
		).toBeTruthy();
		expect(
			list.getByRole("button", { name: "Linear issue in Agent Test" }),
		).toBeTruthy();
		expect(
			list.getByRole("button", { name: "Slack message to #test-agents" }),
		).toBeTruthy();
	});

	test("a click unchecks a row and checks it again", async () => {
		const list = mount();
		await list.press(list.box(/Add a retry/));
		expect(list.checked()).toEqual(["true", "false", "true"]);
		expect(list.steps().map((step) => step?.id)).toEqual(["pricing", "notes"]);
		await list.press(list.box(/Add a retry/));
		expect(list.steps().map((step) => step?.id)).toEqual([
			"pricing",
			"retry",
			"notes",
		]);
	});

	test("a done row is finished: no box, struck, with its result as a link", () => {
		const list = mount(fx.partlyRoutedItems);
		expect(list.getAllByRole("checkbox")).toHaveLength(1);
		expect(list.row("pricing").dataset.state).toBe("done");
		expect(
			list.row("pricing").querySelector(".line-through")?.textContent,
		).toBe("Send Dana the updated pricing sheet");
		const link = list.getByRole("link", {
			name: "Filed AGT-12 in Agent Test",
		}) as HTMLAnchorElement;
		expect(link.href).toBe("https://linear.app/lumen-labs/issue/AGT-12");
		expect(list.row("pricing").querySelector("button")).toBeNull();
	});

	test("a done row with no address is plain text", () => {
		const list = mount(fx.allRoutedItems);
		expect(list.getByText("Sent to #test-agents").closest("a")).toBeNull();
		expect(list.queryAllByRole("checkbox")).toEqual([]);
	});

	test("an unavailable row cannot be checked and says why", async () => {
		const list = mount(fx.unavailableItems);
		expect(list.checked()).toEqual(["false", "true", "false"]);
		expect(list.box(/Send Dana/).disabled).toBe(true);
		expect(list.box(/Share the launch date/).disabled).toBe(true);
		expect(list.getByText(fx.GMAIL_NOT_CONNECTED)).toBeTruthy();
		expect(list.getByText("That conversation is gone")).toBeTruthy();
		await list.press(list.box(/Send Dana/));
		expect(list.steps().map((step) => step?.id)).toEqual(["retry"]);
		expect(
			list.row("pricing").querySelector("button[aria-expanded]"),
		).toBeNull();
	});

	test("disabled: no box can be changed", () => {
		const list = mount(fx.routedItems, true);
		expect(
			list
				.getAllByRole("checkbox")
				.map((each) => each.hasAttribute("disabled")),
		).toEqual([true, true, true]);
	});
});

describe("keyboard", () => {
	test("the box is a button, so Space toggles it; Enter opens the row", async () => {
		const list = mount();
		const box = list.box(/Add a retry/);
		expect(box.tagName).toBe("BUTTON");
		expect(list.queryByLabelText("Title")).toBeNull();
		await list.press(box, "Enter");
		expect(list.checked()).toEqual(["true", "true", "true"]);
		expect((list.getByLabelText("Title") as HTMLInputElement).value).toBe(
			"Add a retry to the export job",
		);
		await list.press(box, "Enter");
		expect(
			list
				.getByRole("button", { name: "Linear issue in Agent Test" })
				.getAttribute("aria-expanded"),
		).toBe("false");
	});
});

describe("editors", () => {
	test("Linear: the draft editor changes what the row sends", async () => {
		const list = mount();
		await list.press(
			list.getByRole("button", { name: "Linear issue in Agent Test" }),
		);
		await kit.act(async () => {
			kit.fireEvent.change(list.getByLabelText("Title"), {
				target: { value: "Retry three times" },
			});
		});
		expect(list.steps()[1]).toMatchObject({
			id: "retry",
			linear: { title: "Retry three times" },
		});
	});

	test("Gmail: the compose window changes recipients, subject and body", async () => {
		const list = mount();
		await list.press(list.getByRole("button", { name: /Gmail draft/ }));
		expect(list.getByText("New Message")).toBeTruthy();
		expect(list.getByText("riley@lumenlabs.example")).toBeTruthy();
		await kit.act(async () => {
			kit.fireEvent.change(list.getByLabelText("Subject"), {
				target: { value: "Pricing" },
			});
		});
		await kit.write(kit.editors(list.row("pricing"))[0], "See the folder.");
		expect(list.steps()[0]).toEqual({
			id: "pricing",
			gmail: {
				to: ["dana.whitfield@northwind.example"],
				subject: "Pricing",
				body: "See the folder.",
			},
		});
	});

	test("Slack: the To line is read only and the box changes the message", async () => {
		const list = mount();
		await list.press(list.getByRole("button", { name: /Slack message/ }));
		const row = list.row("notes");
		expect(row.textContent).toContain("To:");
		expect(row.querySelector("[data-channel-kind='channel']")).toBeTruthy();
		expect(
			row.querySelector("[aria-label='Find a channel or person']"),
		).toBeNull();
		await kit.write(kit.editors(row)[0], "Launch is the 14th");
		expect(list.steps()[2]).toMatchObject({
			id: "notes",
			slack: { to: "C0TESTAGNT1", text: "Launch is the 14th" },
		});
		await kit.write(kit.editors(row)[0], "");
		expect(list.steps()[2]).toBeNull();
	});

	test("a closed row keeps what was typed in it", async () => {
		const list = mount();
		const chip = list.getByRole("button", { name: /Slack message/ });
		await list.press(chip);
		await kit.write(kit.editors(list.row("notes"))[0], "Kept");
		await list.press(chip);
		await list.press(list.getByRole("button", { name: /Linear issue/ }));
		await list.press(chip);
		expect(kit.editors(list.row("notes"))[0]?.getText()).toBe("Kept");
		expect(list.steps()[2]).toMatchObject({
			slack: { to: "C0TESTAGNT1", text: "Kept" },
		});
	});
});
