import { GlobalRegistrator } from "@happy-dom/global-registrator";

const alreadyRegistered = GlobalRegistrator.isRegistered;
if (!alreadyRegistered) GlobalRegistrator.register();
(
	globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

const { afterAll, afterEach, describe, expect, mock, setSystemTime, test } =
	await import("bun:test");
setSystemTime(new Date("2037-10-01T12:00:00-07:00"));
const { act, cleanup, fireEvent, render } = await import(
	"@testing-library/react"
);
const { useState } = await import("react");
const fx = await import("../linearFixtures");
const { IssueFields } = await import("./IssueFields");

import type { LinearFieldsView } from "../../types";

afterEach(cleanup);
afterAll(async () => {
	setSystemTime();
	if (!alreadyRegistered) await GlobalRegistrator.unregister();
});

type Props = Parameters<typeof IssueFields<Partial<LinearFieldsView>>>[0];

function mount(overrides: Partial<Props> = {}) {
	const onChange = mock();
	function Harness() {
		const [value, setValue] = useState<Partial<LinearFieldsView>>(
			overrides.value ?? fx.triageIssue.fields,
		);
		return (
			<IssueFields
				options={fx.options}
				teamName="Agent Test"
				{...overrides}
				value={value}
				onChange={(next) => {
					onChange(next);
					setValue(next);
				}}
			/>
		);
	}
	const view = render(<Harness />);
	const chip = (key: string) =>
		view.container.querySelector(`[data-field="${key}"]`) as HTMLButtonElement;
	const open = (key: string) =>
		act(async () => {
			// A popover that just closed swallows a click made in the same tick.
			await new Promise((resolve) => setTimeout(resolve, 50));
			fireEvent.click(chip(key));
		});
	const search = () =>
		document.body.querySelector(
			"[data-slot=popover-content] input",
		) as HTMLInputElement | null;
	const rows = () =>
		[...document.body.querySelectorAll("[role=option]")].map(
			(row) => row.textContent ?? "",
		);
	const key = (name: string) =>
		act(async () => {
			fireEvent.keyDown(search() as HTMLInputElement, { key: name });
		});
	const type = (text: string) =>
		act(async () => {
			fireEvent.change(search() as HTMLInputElement, {
				target: { value: text },
			});
		});
	const shortcut = (name: string, shiftKey = false) =>
		act(async () => {
			await new Promise((resolve) => setTimeout(resolve, 50));
			fireEvent.keyDown(chip("state"), { key: name, shiftKey });
		});
	const last = () => onChange.mock.calls.at(-1)?.[0];
	return {
		...view,
		onChange,
		chip,
		open,
		search,
		rows,
		key,
		type,
		shortcut,
		last,
	};
}

describe("the chip row", () => {
	test("is Linear's: status, priority, assignee, project, estimate, labels, cycle", () => {
		const fields = mount();
		expect(
			[...fields.container.querySelectorAll("[data-field]")].map((chip) =>
				chip.getAttribute("data-field"),
			),
		).toEqual([
			"state",
			"priority",
			"assignee",
			"project",
			"estimate",
			"labels",
			"cycle",
		]);
		expect(fields.chip("priority").textContent).toBe("Priority");
		expect(fields.chip("cycle").getAttribute("aria-label")).toBe("Cycle");
	});

	test("a team that does not estimate or run cycles has no chip for them", () => {
		const fields = mount({
			options: { ...fx.options, estimates: [], cycles: [] },
		});
		expect(fields.chip("estimate")).toBeNull();
		expect(fields.chip("cycle")).toBeNull();
	});

	test("show limits the chips", () => {
		const fields = mount({ show: ["state", "labels"] });
		expect(fields.container.querySelectorAll("[data-field]")).toHaveLength(2);
	});

	test("a set value reads on its chip", () => {
		const fields = mount({
			value: {
				...fx.triageIssue.fields,
				state: fx.todo.id,
				priority: 2,
				assignee: fx.lena.id,
				labels: [fx.bug.id, fx.desktop.id],
				cycle: fx.cycle1.id,
				project: fx.agentProject.id,
				estimate: 3,
			},
		});
		expect(
			[...fields.container.querySelectorAll("[data-field]")].map(
				(chip) => chip.textContent,
			),
		).toEqual([
			"Todo",
			"High",
			"LLena Fischer",
			"Agent Test project",
			"3 Points",
			"2 labels",
			"Cycle 1",
		]);
	});

	test("disabled chips do not open", async () => {
		const fields = mount({ disabled: true });
		await fields.open("state");
		expect(fields.search()).toBeNull();
	});

	test("a chip whose value differs from the issue shows old → new", () => {
		const fields = mount({
			value: { ...fx.editIssue.fields, priority: 3 },
			baseline: fx.editIssue.fields,
		});
		expect(fields.chip("priority").textContent).toBe("PriorityMedium");
		expect(fields.chip("priority").hasAttribute("data-changed")).toBe(true);
		expect(fields.chip("state").hasAttribute("data-changed")).toBe(false);
	});
});

describe("the menus", () => {
	test("status: Linear's placeholder, rows and number hints", async () => {
		const fields = mount({
			value: { ...fx.triageIssue.fields, state: fx.backlog.id },
		});
		await fields.open("state");
		expect(fields.search()?.placeholder).toBe("Change status…");
		expect(fields.rows()).toEqual([
			"Backlog1",
			"Todo2",
			"In Progress3",
			"In Review4",
			"Done5",
			"Canceled6",
		]);
		expect(
			document.body.querySelector("[role=option][aria-selected=true]")
				?.textContent,
		).toBe("Backlog1");
		expect(document.body.querySelector("[data-slot=kbd]")?.textContent).toBe(
			"S",
		);
	});

	test("typing filters, and no match empties the list", async () => {
		const fields = mount();
		await fields.open("state");
		await fields.type("pro");
		expect(fields.rows()).toEqual(["In Progress3"]);
		await fields.type("zzz");
		expect(fields.rows()).toEqual([]);
	});

	test("a number key picks that row and closes", async () => {
		const fields = mount();
		await fields.open("state");
		await fields.key("3");
		expect(fields.last().state).toBe(fx.inProgress.id);
		expect(fields.search()).toBeNull();
		expect(fields.chip("state").textContent).toBe("In Progress");
	});

	test("Enter picks the highlighted row; the arrows move it", async () => {
		const fields = mount();
		await fields.open("priority");
		expect(fields.search()?.placeholder).toBe("Set priority to…");
		await fields.key("ArrowDown");
		await fields.key("ArrowDown");
		await fields.key("ArrowUp");
		await fields.key("Enter");
		expect(fields.last().priority).toBe(1);
	});

	test("Enter picks the first match of a search", async () => {
		const fields = mount();
		await fields.open("assignee");
		expect(fields.search()?.placeholder).toBe("Assign to…");
		await fields.type("mar");
		await fields.key("Enter");
		expect(fields.last().assignee).toBe(fx.marcus.id);
	});

	test("assignee: people numbered from 1, apps in their own section, 0 clears", async () => {
		const fields = mount({
			value: { ...fx.triageIssue.fields, assignee: fx.lena.id },
		});
		await fields.open("assignee");
		expect(fields.rows()).toEqual([
			"No assignee0",
			"LLena Fischer1",
			"MMarcus Oyelaran2",
			"RRiya Kapoor3",
			"TTriage Bot",
		]);
		expect(document.body.textContent).toContain("Other agents");
		await fields.key("0");
		expect(fields.last().assignee).toBeNull();
	});

	test("project: the team's first, then the others", async () => {
		const fields = mount();
		await fields.open("project");
		expect(fields.search()?.placeholder).toBe("Add to project…");
		expect(fields.rows()).toEqual([
			"No project0",
			"Agent Test project",
			"Leaderboard",
		]);
		const text = document.body.textContent ?? "";
		expect(text).toContain("Projects in Agent Test team");
		expect(text).toContain("Other projects");
		await act(async () => {
			fireEvent.click(
				document.body.querySelectorAll("[role=option]")[1] as Element,
			);
		});
		expect(fields.last().project).toBe(fx.agentProject.id);
	});

	test("estimate and cycle", async () => {
		const fields = mount();
		await fields.open("estimate");
		expect(fields.search()?.placeholder).toBe("Set estimate to…");
		expect(fields.rows()).toEqual([
			"No estimate",
			"1 Point",
			"2 Points",
			"3 Points",
			"5 Points",
			"8 Points",
		]);
		await fields.type("5");
		await fields.key("Enter");
		expect(fields.last().estimate).toBe(5);
		await fields.open("cycle");
		expect(fields.search()?.placeholder).toBe("Add to cycle…");
		expect(fields.rows()).toEqual([
			"No cycle0",
			"Cycle 1Oct 5 - Oct 19 ・ Upcoming",
			"Cycle 2Oct 19 - Nov 2",
		]);
		await fields.key("ArrowDown");
		await fields.key("Enter");
		expect(fields.last().cycle).toBe(fx.cycle1.id);
	});

	test("labels: several can be checked, and the menu stays open", async () => {
		const fields = mount();
		await fields.open("labels");
		expect(fields.search()?.placeholder).toBe("Add labels…");
		const pick = (name: string) =>
			act(async () => {
				fireEvent.click(
					[...document.body.querySelectorAll("[role=option]")].find(
						(row) => row.textContent === name,
					) as Element,
				);
			});
		await pick("Bug");
		await pick("Feature");
		expect(fields.last().labels).toEqual([fx.bug.id, fx.feature.id]);
		expect(fields.search()).not.toBeNull();
		await pick("Bug");
		expect(fields.last().labels).toEqual([fx.feature.id]);
	});

	test("labels: one of a group takes the place of the other", async () => {
		const fields = mount({
			value: { ...fx.triageIssue.fields, labels: [fx.bug.id, fx.desktop.id] },
		});
		await fields.open("labels");
		await act(async () => {
			fireEvent.click(
				[...document.body.querySelectorAll("[role=option]")].find(
					(row) => row.textContent === "Mobile",
				) as Element,
			);
		});
		expect(fields.last().labels).toEqual([fx.bug.id, fx.mobile.id]);
	});
});

describe("the keys", () => {
	const cases: [string, boolean, string][] = [
		["s", false, "Change status…"],
		["p", false, "Set priority to…"],
		["a", false, "Assign to…"],
		["l", false, "Add labels…"],
		["C", true, "Add to cycle…"],
		["P", true, "Add to project…"],
		["E", true, "Set estimate to…"],
	];
	for (const [name, shift, placeholder] of cases)
		test(`${shift ? "⇧" : ""}${name.toUpperCase()} opens "${placeholder}"`, async () => {
			const fields = mount();
			await fields.shortcut(name, shift);
			expect(fields.search()?.placeholder).toBe(placeholder);
		});

	test("a key typed in a text field opens nothing", async () => {
		const fields = mount();
		const box = document.createElement("input");
		fields.container.firstElementChild?.appendChild(box);
		await act(async () => {
			fireEvent.keyDown(box, { key: "s" });
		});
		expect(fields.search()).toBeNull();
	});

	test("the keys are off when disabled", async () => {
		const fields = mount({ disabled: true });
		await fields.shortcut("s");
		expect(fields.search()).toBeNull();
	});
});

describe("Quick suggestions", () => {
	test("each suggestion is a dashed chip; a click applies it and it goes", async () => {
		const fields = mount({
			suggested: { priority: 2, labels: [fx.bug.id, fx.desktop.id] },
		});
		expect(fields.getByText("Quick suggestions")).toBeTruthy();
		const chips = () =>
			[...fields.container.querySelectorAll("[data-suggestion]")].map(
				(chip) => chip.textContent,
			);
		expect(chips()).toEqual(["High", "Bug", "Desktop"]);
		await act(async () => {
			fireEvent.click(
				fields.container.querySelector("[data-suggestion]") as Element,
			);
		});
		expect(fields.last().priority).toBe(2);
		expect(chips()).toEqual(["Bug", "Desktop"]);
		await act(async () => {
			fireEvent.click(
				fields.container.querySelector("[data-suggestion]") as Element,
			);
		});
		expect(fields.last().labels).toEqual([fx.bug.id]);
	});

	test("nothing suggested draws no row", () => {
		const fields = mount({ suggested: {} });
		expect(fields.queryByText("Quick suggestions")).toBeNull();
	});
});

describe("a value that holds only some properties", () => {
	test("leaves the others untouched and reads an explicit none", async () => {
		const fields = mount({ value: { state: fx.done.id }, sparse: true });
		expect(fields.chip("assignee").textContent).toBe("Assignee");
		await fields.open("assignee");
		await fields.key("0");
		expect(fields.last()).toEqual({ state: fx.done.id, assignee: null });
		expect(fields.chip("assignee").textContent).toBe("No assignee");
	});

	test("labels are ones to add: a group does not limit them, and none leaves the property out", async () => {
		const fields = mount({ value: { state: fx.done.id }, sparse: true });
		await fields.open("labels");
		const pick = (name: string) =>
			act(async () => {
				fireEvent.click(
					[...document.body.querySelectorAll("[role=option]")].find(
						(row) => row.textContent === name,
					) as Element,
				);
			});
		await pick("Desktop");
		await pick("Mobile");
		expect(fields.last()).toEqual({
			state: fx.done.id,
			labels: [fx.desktop.id, fx.mobile.id],
		});
		expect(fields.chip("labels").textContent).toBe("2 labels");
		await pick("Desktop");
		await pick("Mobile");
		expect(fields.last()).toEqual({ state: fx.done.id });
		expect(fields.chip("labels").textContent).toBe("Labels");
	});
});
