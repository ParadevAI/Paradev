import { slackTestKit } from "../slackTestKit";

const kit = await slackTestKit();
const { describe, expect, test } = await import("bun:test");
const fx = await import("../githubFixtures");
const { GithubBranchBlock } = await import("./GithubBranchBlock");

type Props = Parameters<typeof GithubBranchBlock>[0];
type StartProps = import("react").ComponentProps<Props["StartAgent"]>;

let started: StartProps | null = null;
function StartAgent(props: StartProps) {
	started = props;
	return props.trigger;
}
const Block = (props: Omit<Props, "StartAgent">) => (
	<GithubBranchBlock {...props} StartAgent={StartAgent} />
);
const mount = (props: Partial<Props> = {}) => {
	started = null;
	return kit.mount(Block, {
		view: fx.branchView,
		actions: fx.branchActions,
		...props,
	});
};

const MENU = "Choose how to update the branch";
const menu = (block: ReturnType<typeof mount>) =>
	kit.act(async () => {
		kit.fireEvent.keyDown(block.button(MENU), { key: "Enter" });
	});
const item = (name: string) =>
	[...document.body.querySelectorAll("[role=menuitemradio]")].find((each) =>
		each.textContent?.startsWith(name),
	) as HTMLElement;
const pick = (name: string) =>
	kit.act(async () => {
		kit.fireEvent.click(item(name));
	});

describe("the branch's state, in GitHub's words", () => {
	test("behind: the count and the commits it lacks", () => {
		const block = mount();
		expect(
			block.getByText("This branch is out-of-date with the base branch"),
		).toBeTruthy();
		expect(block.getByText("3 commits behind main")).toBeTruthy();
		expect(
			[...block.container.querySelectorAll("li")].map(
				(each) => each.textContent,
			),
		).toEqual([
			"Queue: drop entries older than the retention window (#479)Blake Rivera4be19c0",
			"Desktop: keep the sidebar width across restarts (#476)Casey Nguyenc07a551",
			"Bump bun to 1.3.2 (#474)Riley Morgan1d86f3a",
		]);
	});

	test("one commit behind reads as one", () => {
		const block = mount({ view: { ...fx.branchView, behindBy: 1 } });
		expect(block.getByText("1 commit behind main")).toBeTruthy();
	});

	test("more commits behind than are listed", () => {
		const block = mount({ view: fx.branchManyBehindView });
		expect(block.getByText("41 commits behind main")).toBeTruthy();
		expect(block.getByText("and 38 more")).toBeTruthy();
	});

	test("conflicts, computing and current", () => {
		expect(
			mount({ view: fx.branchConflictsView }).getByText(
				"This branch has conflicts that must be resolved",
			),
		).toBeTruthy();
		kit.cleanup();
		expect(
			mount({ view: fx.branchComputingView }).getByText(
				"Checking for the ability to merge",
			),
		).toBeTruthy();
		kit.cleanup();
		const current = mount({ view: fx.branchCurrentView });
		expect(current.getByText("This branch is up to date")).toBeTruthy();
		expect(current.queryByText(/commits behind/)).toBeNull();
	});
});

describe("update", () => {
	test("a merge commit by default, after the plan's sentence, on the head the reader saw", async () => {
		const block = mount();
		await block.click("Update branch");
		expect(block.question()).toBe(fx.BRANCH_PLAN.merge);
		expect(block.onAct.mock.calls).toEqual([]);
		await block.confirm();
		expect(block.onAct.mock.calls).toEqual([
			["update", { method: "merge", sha: fx.HEAD_SHA }],
		]);
	});

	test("choosing rebase changes the button, the sentence and the method together", async () => {
		const block = mount();
		await menu(block);
		expect(item("Update with merge commit").getAttribute("aria-checked")).toBe(
			"true",
		);
		await pick("Update with rebase");
		await block.click("Update with rebase");
		expect(block.question()).toBe(fx.BRANCH_PLAN.rebase);
		await block.confirm();
		expect(block.onAct.mock.calls).toEqual([
			["update", { method: "rebase", sha: fx.HEAD_SHA }],
		]);
	});

	test("a branch the reader cannot push to: the server's reason turns it off", () => {
		const block = mount({
			view: fx.branchForkView,
			actions: fx.branchActions.map((action) =>
				action.id === "update"
					? { ...action, disabled: fx.FORK_NO_PUSH }
					: action,
			),
		});
		expect(block.button("Update branch").disabled).toBe(true);
		expect(block.button(MENU).disabled).toBe(true);
	});

	test("off with its menu when the server turns it off, and while another action runs", () => {
		const block = mount({
			view: fx.branchConflictsView,
			actions: fx.branchConflictsActions,
		});
		expect(block.button("Update branch").disabled).toBe(true);
		expect(block.button(MENU).disabled).toBe(true);
		expect(block.button("Resolve with an agent").disabled).toBe(false);
		kit.cleanup();
		const busy = mount({ pending: true });
		expect(busy.button("Update branch").disabled).toBe(true);
		expect(busy.button(MENU).disabled).toBe(true);
	});
});

describe("other ways on", () => {
	test("an agent starts on the server's task, under the server's label", () => {
		const block = mount();
		expect(block.button("Rebase with an agent")).toBeTruthy();
		expect(started?.tasks[0]).toMatchObject({
			slug: fx.branchView.fix.slug,
			title: fx.branchView.fix.title,
			description: fx.branchView.fix.prompt,
		});
		started?.onCreated?.(["ws_7"]);
		expect(block.onAct.mock.calls).toEqual([
			["started", { workspace: "ws_7" }],
		]);
	});

	test("Leave it dismisses, and a resolved card has no actions", async () => {
		const block = mount();
		await block.click("Leave it");
		expect(block.onAct.mock.calls).toEqual([["dismiss"]]);
		kit.cleanup();
		expect(mount({ done: true }).queryAllByRole("button")).toEqual([]);
	});
});
