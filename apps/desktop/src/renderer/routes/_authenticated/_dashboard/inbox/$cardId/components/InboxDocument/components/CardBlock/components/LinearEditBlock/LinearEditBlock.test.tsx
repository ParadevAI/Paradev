import { GlobalRegistrator } from "@happy-dom/global-registrator";

const alreadyRegistered = GlobalRegistrator.isRegistered;
if (!alreadyRegistered) GlobalRegistrator.register();
(
	globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

const { afterAll, afterEach, describe, expect, mock, setSystemTime, test } =
	await import("bun:test");
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
setSystemTime(new Date("2026-09-30T19:00:00Z"));
const { act, cleanup, fireEvent, render } = await import(
	"@testing-library/react"
);
const { TooltipProvider } = await import("@superset/ui/tooltip");
const fx = await import("../linearFixtures");
const { LinearEditBlock } = await import("./LinearEditBlock");

afterEach(cleanup);
afterAll(async () => {
	setSystemTime();
	if (!alreadyRegistered) await GlobalRegistrator.unregister();
});

type Props = Parameters<typeof LinearEditBlock>[0];

function mount(overrides: Partial<Props> = {}) {
	const onAct = mock();
	const view = render(
		<TooltipProvider>
			<LinearEditBlock
				view={fx.editView}
				actions={fx.editActions}
				done={false}
				pending={false}
				failure={null}
				onAct={onAct}
				{...overrides}
			/>
		</TooltipProvider>,
	);
	const button = (name: string | RegExp) =>
		view.getByRole("button", { name }) as HTMLButtonElement;
	const click = (name: string | RegExp) =>
		act(async () => {
			await new Promise((resolve) => setTimeout(resolve, 50));
			fireEvent.click(button(name));
		});
	const title = () => view.getByLabelText("Title") as HTMLInputElement;
	const change = (element: Element, value: string) =>
		act(async () => {
			fireEvent.change(element, { target: { value } });
		});
	const chip = (key: string) =>
		view.container.querySelector(`[data-field="${key}"]`) as HTMLButtonElement;
	const pick = async (key: string, digit: string) => {
		await act(async () => {
			await new Promise((resolve) => setTimeout(resolve, 50));
			fireEvent.click(chip(key));
		});
		await act(async () => {
			fireEvent.keyDown(
				document.body.querySelector(
					"[data-slot=popover-content] input",
				) as Element,
				{ key: digit },
			);
		});
	};
	const diff = () =>
		[...view.container.querySelectorAll("[data-diff]")].map(
			(line) => `${line.getAttribute("data-diff")}: ${line.textContent}`,
		);
	return { ...view, onAct, button, click, title, change, chip, pick, diff };
}

const { issue, proposed } = fx.editView;

describe("the proposed changes against the issue", () => {
	test("the title: the old one struck through, the new one in the field", () => {
		const block = mount();
		expect(block.container.querySelector("del")?.textContent).toBe(issue.title);
		expect(block.title().value).toBe(proposed.title ?? "");
	});

	test("the description: removed and added lines, with the changed words marked", () => {
		const block = mount();
		expect(block.diff()).toEqual([
			"same: Archiving needs the context menu.",
			"same:  ",
			"removed: −It should have a shortcut.",
			"added: +It should have a shortcut: `⌘⇧A`.",
			"same:  ",
			"same: - Works from the sidebar",
			"added: +- Works from the workspace itself",
		]);
		expect(
			[...block.container.querySelectorAll("mark")].map(
				(word) => word.textContent,
			),
		).toEqual(["shortcut.", "shortcut:", " ", "`⌘⇧A`."]);
	});

	test("the properties: each changed chip shows old → new", () => {
		const block = mount();
		expect(block.chip("state").textContent).toBe("BacklogTodo");
		expect(block.chip("priority").textContent).toBe("PriorityMedium");
		expect(block.chip("assignee").textContent).toBe("AssigneeRRiya Kapoor");
		expect(block.chip("labels").hasAttribute("data-changed")).toBe(false);
	});
});

describe("Apply", () => {
	test("sends what differs from the issue, and the version", async () => {
		const block = mount();
		await block.click("Apply changes");
		expect(block.onAct.mock.calls).toEqual([
			[
				"apply",
				{
					title: proposed.title,
					description: proposed.description,
					state: fx.todo.id,
					priority: 3,
					assignee: fx.riya.id,
					version: issue.version,
				},
			],
		]);
	});

	test("every field can be changed first", async () => {
		const block = mount();
		await block.change(block.title(), issue.title);
		expect(block.container.querySelector("del")).toBeNull();
		await block.click("Edit");
		const box = block.getByLabelText("Description") as HTMLTextAreaElement;
		expect(box.value).toBe(proposed.description ?? "");
		await block.change(box, "Archiving needs a shortcut.");
		await block.click("Done");
		expect(block.diff()[0]).toBe("removed: −Archiving needs the context menu.");
		await block.pick("state", "1");
		await block.pick("priority", "1");
		await block.click("Apply changes");
		expect(block.onAct.mock.calls).toEqual([
			[
				"apply",
				{
					description: "Archiving needs a shortcut.",
					priority: 1,
					assignee: fx.riya.id,
					version: issue.version,
				},
			],
		]);
	});

	test("is off with nothing to change, and with an empty title", async () => {
		const block = mount({
			view: {
				...fx.editView,
				proposed: { title: null, description: null, fields: {} },
			},
		});
		expect(block.button("Apply changes").disabled).toBe(true);
		expect(block.container.querySelector("[data-diff]")).toBeNull();
		await block.change(block.title(), "Archive with a key");
		expect(block.button("Apply changes").disabled).toBe(false);
		await block.change(block.title(), "  ");
		expect(block.button("Apply changes").disabled).toBe(true);
	});

	test("Keep as is dismisses", async () => {
		const block = mount();
		await block.click("Keep as is");
		expect(block.onAct.mock.calls).toEqual([["dismiss"]]);
	});
});

describe("states", () => {
	test("resolved: the issue as Linear holds it, and no controls", () => {
		const block = mount({ done: true });
		expect(block.getByText(issue.title)).toBeTruthy();
		expect(block.queryByRole("button", { name: "Apply changes" })).toBeNull();
		expect(block.queryByLabelText("Title")).toBeNull();
		expect(block.chip("state").disabled).toBe(true);
		expect(block.chip("state").textContent).toBe("Backlog");
	});

	test("pending turns the controls off", () => {
		const block = mount({ pending: true });
		expect(block.button("Apply changes").disabled).toBe(true);
		expect(block.button("Keep as is").disabled).toBe(true);
		expect(block.title().disabled).toBe(true);
		expect(block.chip("state").disabled).toBe(true);
	});

	test("the failure is shown", () => {
		const block = mount({
			failure: "The issue changed in Linear. Look again before you apply",
		});
		expect(block.getByRole("alert").textContent).toBe(
			"The issue changed in Linear. Look again before you apply",
		);
	});

	test("an action the reader may not take is off", async () => {
		const block = mount({
			actions: fx.disabledActions(fx.editActions, "You cannot edit this issue"),
		});
		expect(block.button("Apply changes").disabled).toBe(true);
		await block.click("Apply changes");
		expect(block.onAct).not.toHaveBeenCalled();
	});
});
