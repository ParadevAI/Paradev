import { supersetTestKit } from "../supersetTestKit";

const kit = await supersetTestKit();
const { describe, expect, test } = await import("bun:test");
const { formatDate } = await import("@superset/i18n/format");
const fx = await import("../supersetFixtures");
const { TaskAssignedBlock } = await import("./TaskAssignedBlock");

type Props = Parameters<typeof TaskAssignedBlock>[0];
const Block = kit.inApp(TaskAssignedBlock);
const mount = (props: Partial<Props> = {}) =>
	kit.mount(Block, {
		view: fx.taskAssignedView,
		actions: fx.taskActions,
		...props,
	});
const OPEN_TASK = [{ to: "/tasks/$taskId", params: { taskId: fx.task.id } }];
const names = (block: ReturnType<typeof mount>) =>
	block.getAllByRole("button").map((button) => button.textContent);

describe("the task", () => {
	test("its key, title, priority, status, assignee and description", () => {
		const block = mount();
		expect(block.getByText("LUM-214")).toBeTruthy();
		expect(block.getByText(fx.task.title)).toBeTruthy();
		expect(block.getByText("high")).toBeTruthy();
		expect(block.getByText("Todo")).toBeTruthy();
		expect(block.getByText("Mira Okafor")).toBeTruthy();
		expect(
			block.getByText("Writes that lose the lease are dropped today."),
		).toBeTruthy();
	});

	test("labels, a due date and markdown in the description", () => {
		const block = mount({ view: fx.taskDetailedView });
		expect(block.getByText("urgent")).toBeTruthy();
		for (const label of ["sync", "bug", "no color"])
			expect(block.getByText(label)).toBeTruthy();
		expect(
			block.getByText(
				formatDate(new Date(fx.taskDetailedView.task.dueDate ?? ""), {
					dateStyle: "medium",
				}),
			),
		).toBeTruthy();
		expect(
			block.getByText("Retry the write with backoff, at most five times"),
		).toBeTruthy();
		expect(block.container.querySelector("pre")).toBeTruthy();
	});

	test("a task with no assignee or description shows neither", () => {
		const block = mount({ view: fx.taskBareView });
		expect(block.getByText(fx.task.slug)).toBeTruthy();
		expect(block.queryByText("Mira Okafor")).toBeNull();
		expect(block.getByText("none")).toBeTruthy();
	});

	test("the workspaces already on it", () => {
		const none = mount();
		expect(none.queryByText(fx.cloudWorkingWorkspace.name)).toBeNull();
		kit.cleanup();
		const block = mount({ view: fx.taskWithWorkspacesView });
		expect(block.getByText("In progress")).toBeTruthy();
		expect(block.getByText(fx.cloudWorkingWorkspace.name)).toBeTruthy();
		expect(block.getByText(fx.cloudNoPullRequestWorkspace.name)).toBeTruthy();
	});

	test("the row and Open task both open the task", async () => {
		const block = mount();
		await block.click(/LUM-214/);
		await block.click("Open task");
		expect(kit.navigate.mock.calls).toEqual([OPEN_TASK, OPEN_TASK]);
		expect(block.onAct).not.toHaveBeenCalled();
	});
});

describe("start with an agent", () => {
	test("hands the task to the run-in-workspace picker", () => {
		mount({ view: fx.taskDetailedView });
		expect(kit.picker.props?.tasks).toEqual([
			{
				id: fx.task.id,
				slug: "LUM-214",
				title: fx.task.title,
				description: fx.taskDetailedView.task.description,
				branch: null,
			},
		]);
	});

	test("a task with a branch goes with its branch", () => {
		mount({ view: fx.taskBareView });
		expect(kit.picker.props?.tasks).toEqual([
			{
				id: fx.task.id,
				slug: fx.task.slug,
				title: fx.task.title,
				description: null,
				branch: "mira/agt-31-retry-writes",
			},
		]);
	});

	test("marks the card started once the picker completes, not when it opens", async () => {
		const block = mount();
		await block.click("Start with an agent");
		expect(block.onAct).not.toHaveBeenCalled();
		await kit.act(async () => {
			kit.picker.props?.onComplete();
		});
		expect(block.onAct.mock.calls).toEqual([["started"]]);
	});
});

describe("states", () => {
	test("a resolved card keeps the task and its workspaces and drops both buttons", () => {
		const block = mount({ view: fx.taskWithWorkspacesView, done: true });
		expect(block.getByText(fx.task.title)).toBeTruthy();
		expect(block.getByText(fx.cloudWorkingWorkspace.name)).toBeTruthy();
		expect(names(block)).not.toContain("Open task");
		expect(names(block)).not.toContain("Start with an agent");
		expect(kit.picker.props).toBeNull();
	});

	test("while the card is being marked, Start is off and Open task still works", async () => {
		const block = mount({ pending: true });
		expect(block.button("Start with an agent").disabled).toBe(true);
		await block.click("Open task");
		expect(kit.navigate).toHaveBeenCalledTimes(1);
	});

	test("the failure sentence is shown above the buttons", () => {
		const block = mount({ failure: "That task no longer exists" });
		expect(block.getByText("That task no longer exists")).toBeTruthy();
	});

	test("a very long title and many labels are in the page in full", () => {
		const block = mount({ view: fx.taskLongView });
		expect(block.getAllByText(fx.LONG_NAME).length).toBeGreaterThan(0);
		expect(
			block.getByText("a-very-long-label-name-for-the-generated-clients"),
		).toBeTruthy();
	});
});
