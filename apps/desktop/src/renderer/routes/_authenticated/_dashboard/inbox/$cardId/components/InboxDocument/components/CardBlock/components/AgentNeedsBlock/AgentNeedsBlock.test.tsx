import { supersetTestKit } from "../supersetTestKit";

const kit = await supersetTestKit();
const { beforeEach, describe, expect, mock, test } = await import("bun:test");
const fx = await import("../supersetFixtures");
const { AgentNeedsBlock } = await import("./AgentNeedsBlock");

type Props = Parameters<typeof AgentNeedsBlock>[0];
const onConnect = mock();
beforeEach(() => onConnect.mockClear());

const ASK = "Which retry window should the queue use?";
const Block = kit.inApp((props: Omit<Props, "ask" | "onConnect">) => (
	<AgentNeedsBlock {...props} ask={<p>{ASK}</p>} onConnect={onConnect} />
));
const mount = (props: Partial<Props> = {}) =>
	kit.mount(Block, {
		view: fx.credentialView,
		actions: fx.credentialActions("GitHub"),
		...props,
	});
const tool = { view: fx.toolView, actions: fx.toolActions("gh pr merge") };
const names = (block: ReturnType<typeof mount>) =>
	block.getAllByRole("button").map((button) => button.textContent);

describe("a credential", () => {
	test("names the service and scope over the workspace the agent is in", () => {
		const block = mount();
		expect(block.getByText("GitHub")).toBeTruthy();
		expect(block.getByText("repo, read:org")).toBeTruthy();
		expect(
			block.getAllByText(fx.cloudWorkingWorkspace.name).length,
		).toBeGreaterThan(0);
		expect(block.queryByText(ASK)).toBeNull();
	});

	test("Open settings goes to the integrations settings and answers nothing", async () => {
		const block = mount();
		await block.click("Open settings");
		expect(onConnect.mock.calls).toEqual([["/settings/integrations"]]);
		expect(block.onAct).not.toHaveBeenCalled();
	});

	test("connected answers at once", async () => {
		const block = mount();
		await block.click("I connected GitHub");
		expect(block.onAct.mock.calls).toEqual([["connected"]]);
	});

	test("declined takes an optional note for the agent", async () => {
		const block = mount();
		await block.click("Not granting this");
		expect(block.onAct).not.toHaveBeenCalled();
		await block.type(fx.INSTEAD_INPUT, " Use the read-only token. ");
		await block.click("Not granting this");
		expect(block.onAct.mock.calls).toEqual([
			["declined", "Use the read-only token."],
		]);
	});

	test("declined with no note sends none", async () => {
		const block = mount();
		await block.click("Not granting this");
		await block.click("Not granting this");
		expect(block.onAct.mock.calls).toEqual([["declined", undefined]]);
	});

	test("a service with no mark and no scope, and no workspace", () => {
		const block = mount({
			view: fx.otherCredentialView,
			actions: fx.credentialActions("another service"),
		});
		expect(block.getByText("another service")).toBeTruthy();
		expect(block.container.querySelector("code")).toBeNull();
		expect(block.button("I connected another service").disabled).toBe(false);
		expect(block.queryByText(fx.cloudWorkingWorkspace.name)).toBeNull();
	});
});

describe("a tool", () => {
	test("names the tool over the workspace", () => {
		const block = mount(tool);
		expect(block.container.querySelector("code")?.textContent).toBe(
			"gh pr merge",
		);
		expect(block.getAllByTitle(fx.localWorkspace.name).length).toBe(1);
		expect(block.queryByRole("button", { name: "Open settings" })).toBeNull();
	});

	test("allow answers at once", async () => {
		const block = mount(tool);
		await block.click("Allow gh pr merge");
		expect(block.onAct.mock.calls).toEqual([["approve"]]);
	});

	test("don't allow takes an optional note", async () => {
		const block = mount(tool);
		await block.click("Don't allow");
		await block.type(fx.INSTEAD_INPUT, "Open the pull request and stop");
		await block.click("Don't allow");
		expect(block.onAct.mock.calls).toEqual([
			["deny", "Open the pull request and stop"],
		]);
	});

	test("Cancel answers nothing", async () => {
		const block = mount(tool);
		await block.click("Don't allow");
		await block.click("Cancel");
		expect(block.queryByLabelText(fx.INSTEAD_INPUT)).toBeNull();
		expect(block.onAct).not.toHaveBeenCalled();
	});
});

describe("long words", () => {
	test("a long tool name wraps, and its button is cut short inside the card", () => {
		const name = fx.longToolView.tool ?? "";
		const block = mount({
			view: fx.longToolView,
			actions: fx.toolActions(name),
		});
		expect(block.container.querySelector("code")?.className).toContain(
			"[overflow-wrap:anywhere]",
		);
		const allow = block.button(`Allow ${name}`);
		expect(allow.className).toContain("max-w-full");
		expect(allow.firstElementChild?.className).toBe("truncate");
	});
});

describe("a question", () => {
	test("draws the ask it was given and no action bar", () => {
		const block = mount({
			view: fx.questionView,
			actions: fx.toolActions("gh pr merge"),
		});
		expect(block.getByText(ASK)).toBeTruthy();
		expect(names(block)).not.toContain("Allow gh pr merge");
		expect(names(block)).not.toContain("Don't allow");
	});

	test("a failure has no place of its own: the ask shows it", () => {
		const block = mount({
			view: fx.questionView,
			actions: [],
			failure: "That answer is no longer open",
		});
		expect(block.queryByText("That answer is no longer open")).toBeNull();
	});
});

describe("states", () => {
	test("a resolved credential keeps what was asked and drops every control", () => {
		const block = mount({ done: true });
		expect(block.getByText("repo, read:org")).toBeTruthy();
		for (const name of [
			"Open settings",
			"I connected GitHub",
			"Not granting this",
		])
			expect(names(block)).not.toContain(name);
	});

	test("a resolved tool request drops its actions", () => {
		const block = mount({ ...tool, done: true });
		expect(block.getByText("gh pr merge")).toBeTruthy();
		expect(names(block)).not.toContain("Allow gh pr merge");
		expect(names(block)).not.toContain("Don't allow");
	});

	test("while an action runs, none can be taken", async () => {
		const block = mount({ ...tool, pending: true });
		expect(block.button("Allow gh pr merge").disabled).toBe(true);
		expect(block.button("Don't allow").disabled).toBe(true);
		await kit.act(async () => {
			kit.fireEvent.click(block.button("Allow gh pr merge"));
		});
		expect(block.onAct).not.toHaveBeenCalled();
	});

	test("the failure sentence is shown above the actions", () => {
		const block = mount({ ...tool, failure: "The agent stopped waiting" });
		expect(block.getByText("The agent stopped waiting")).toBeTruthy();
	});

	test("an action the reader may not take says why", async () => {
		const block = mount({
			...tool,
			actions: fx.toolActions("gh pr merge").map((action) =>
				action.id === "approve"
					? {
							...action,
							disabled: "Only the workspace's owner can allow this",
						}
					: action,
			),
		});
		const allow = block.button("Allow gh pr merge");
		expect(allow.disabled).toBe(true);
		expect(await kit.reason(allow)).toBe(
			"Only the workspace's owner can allow this",
		);
		expect(block.button("Don't allow").disabled).toBe(false);
	});
});
