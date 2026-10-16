import { supersetTestKit } from "../supersetTestKit";

const kit = await supersetTestKit();
const { describe, expect, mock, test } = await import("bun:test");
const fx = await import("../supersetFixtures");
const { AgentFinishedBlock } = await import("./AgentFinishedBlock");
const { CardBlock } = await import("../../CardBlock");

type Props = Parameters<typeof AgentFinishedBlock>[0];
const Block = kit.inApp(AgentFinishedBlock);
const mount = (props: Partial<Props> = {}) =>
	kit.mount(Block, {
		view: fx.finishedLocalView,
		actions: fx.finishedLocalActions,
		...props,
	});
const cloud = { view: fx.finishedCloudView, actions: fx.finishedCloudActions };
const names = (block: ReturnType<typeof mount>) =>
	block.getAllByRole("button").map((button) => button.textContent);

describe("the workspace", () => {
	test("a local workspace with its branch, pull request, review, checks and changed lines", () => {
		const block = mount();
		expect(block.getAllByTitle(fx.localWorkspace.name).length).toBe(2);
		expect(block.getByText("mira/sync-lease-retry")).toBeTruthy();
		expect(block.getByText("2 days ago")).toBeTruthy();
		expect(block.getByText("#482")).toBeTruthy();
		expect(block.getByText(fx.hostPullRequest.title)).toBeTruthy();
		expect(block.getByText("Approved")).toBeTruthy();
		expect(block.getByText("2/2 checks")).toBeTruthy();
		expect(block.getByText("+184")).toBeTruthy();
		expect(block.getByText("-37")).toBeTruthy();
		expect(
			block.queryByRole("button", { name: "Archive workspace" }),
		).toBeNull();
	});

	test("a cloud workspace with who is in it, a failing check and changes requested", () => {
		const block = mount(cloud);
		expect(block.getAllByText(fx.cloudWorkspace.name).length).toBeGreaterThan(
			0,
		);
		expect(block.getByText("agent/next-invoice-date")).toBeTruthy();
		expect(block.getByText("#497")).toBeTruthy();
		expect(block.getByText("Changes requested")).toBeTruthy();
		expect(block.getByText("+212")).toBeTruthy();
		expect(block.getByText("-48")).toBeTruthy();
		expect(
			block.getByRole("button", { name: "Archive workspace" }),
		).toBeTruthy();
	});

	test("no pull request: the branch alone", () => {
		const block = mount({ view: fx.finishedNoPullRequestView });
		expect(block.getByText("mira/smaller-retry-window")).toBeTruthy();
		expect(block.queryByText(/^#\d+$/)).toBeNull();
		expect(block.queryByText("View on GitHub")).toBeNull();
		expect(block.getByText("No PR for this branch")).toBeTruthy();
	});

	test("a host that did not report its changes shows no counts", () => {
		const block = mount({
			view: { ...fx.finishedLocalView, workspace: fx.localNoChangesWorkspace },
		});
		expect(block.queryByText(/^\+\d+$/)).toBeNull();
	});

	test("Open workspace goes to the local workspace, or the cloud record", async () => {
		const local = mount();
		await local.click("Open workspace");
		expect(kit.navigate.mock.calls).toEqual([
			[
				{
					to: "/v2-workspace/$workspaceId",
					params: { workspaceId: fx.localWorkspace.id },
					search: {},
				},
			],
		]);
		kit.cleanup();
		kit.navigate.mockClear();
		const remote = mount(cloud);
		await remote.click("Open workspace");
		expect(kit.navigate.mock.calls).toEqual([
			[
				{
					to: "/cloud-workspaces/$workspaceId",
					params: { workspaceId: fx.cloudWorkspace.id },
				},
			],
		]);
		expect(local.onAct).not.toHaveBeenCalled();
		expect(remote.onAct).not.toHaveBeenCalled();
	});
});

describe("send back", () => {
	test("sends the typed feedback, trimmed", async () => {
		const block = mount();
		await block.click("Send back");
		expect(block.onAct).not.toHaveBeenCalled();
		await block.type(fx.FEEDBACK_INPUT, "  Cap the retries at five.\n");
		await block.click("Send back");
		expect(block.onAct.mock.calls).toEqual([
			["send_back", "Cap the retries at five."],
		]);
	});

	test("empty or blank feedback cannot be sent, by button or by key", async () => {
		const block = mount();
		await block.click("Send back");
		const box = block.getByLabelText(fx.FEEDBACK_INPUT);
		expect(block.button("Send back").disabled).toBe(true);
		await block.type(fx.FEEDBACK_INPUT, "   \n ");
		expect(block.button("Send back").disabled).toBe(true);
		await kit.act(async () => {
			kit.fireEvent.click(block.button("Send back"));
			kit.fireEvent.keyDown(box, { key: "Enter", metaKey: true });
		});
		expect(block.onAct).not.toHaveBeenCalled();
		await block.type(fx.FEEDBACK_INPUT, "x");
		expect(block.button("Send back").disabled).toBe(false);
	});

	test("Cmd+Enter sends, Escape and Cancel put the actions back", async () => {
		const block = mount(cloud);
		await block.click("Send back");
		await block.type(fx.FEEDBACK_INPUT, "Add a test for the cap");
		await kit.act(async () => {
			kit.fireEvent.keyDown(block.getByLabelText(fx.FEEDBACK_INPUT), {
				key: "Enter",
				metaKey: true,
			});
		});
		expect(block.onAct.mock.calls).toEqual([
			["send_back", "Add a test for the cap"],
		]);
		await kit.act(async () => {
			kit.fireEvent.keyDown(block.getByLabelText(fx.FEEDBACK_INPUT), {
				key: "Escape",
			});
		});
		expect(block.queryByLabelText(fx.FEEDBACK_INPUT)).toBeNull();
		await block.click("Send back");
		expect(
			(block.getByLabelText(fx.FEEDBACK_INPUT) as HTMLTextAreaElement).value,
		).toBe("");
		await block.click("Cancel");
		expect(block.queryByLabelText(fx.FEEDBACK_INPUT)).toBeNull();
		expect(
			block.getByRole("button", { name: "Archive workspace" }),
		).toBeTruthy();
		expect(block.onAct).toHaveBeenCalledTimes(1);
	});
});

describe("archive", () => {
	test("asks with the server's sentence before it archives", async () => {
		const block = mount(cloud);
		await block.click("Archive workspace");
		expect(block.onAct).not.toHaveBeenCalled();
		expect(block.getByText(fx.ARCHIVE_CONFIRM)).toBeTruthy();
		expect(block.queryByRole("textbox")).toBeNull();
		await block.click("Archive workspace");
		expect(block.onAct.mock.calls).toEqual([["archive", undefined]]);
	});

	test("Cancel archives nothing", async () => {
		const block = mount(cloud);
		await block.click("Archive workspace");
		await block.click("Cancel");
		expect(block.queryByText(fx.ARCHIVE_CONFIRM)).toBeNull();
		expect(block.onAct).not.toHaveBeenCalled();
	});

	test("the card sends the sentence the reader saw with the action", async () => {
		const onAct = mock();
		const App = kit.inApp(CardBlock);
		const view = kit.render(
			<kit.TooltipProvider>
				<App
					block={{
						id: "c1",
						type: "card",
						actionable: true,
						card: {
							type: "superset.agent_finished",
							refs: { workspace: fx.cloudWorkspace.id },
						},
						resolved: {
							type: "superset.agent_finished",
							brand: "superset",
							state: "ok",
							title: "Agent finished",
							subtitle: fx.cloudWorkspace.name,
							fields: [],
							view: fx.finishedCloudView,
							actions: fx.finishedCloudActions,
						},
					}}
					done={false}
					pending={false}
					failure={null}
					onAct={onAct}
					onConnect={() => {}}
				/>
			</kit.TooltipProvider>,
		);
		const press = () =>
			kit.act(async () => {
				kit.fireEvent.click(
					view.getByRole("button", { name: "Archive workspace" }),
				);
			});
		await press();
		expect(onAct).not.toHaveBeenCalled();
		await press();
		expect(onAct.mock.calls).toEqual([
			["archive", undefined, fx.ARCHIVE_CONFIRM],
		]);
	});

	test("an archived workspace cannot be archived again, and says why", async () => {
		const block = mount({ ...cloud, actions: fx.finishedArchivedActions });
		const archive = block.button("Archive workspace");
		expect(archive.disabled).toBe(true);
		await kit.act(async () => {
			kit.fireEvent.click(archive);
		});
		expect(block.queryByText(fx.ARCHIVE_CONFIRM)).toBeNull();
		expect(block.onAct).not.toHaveBeenCalled();
		expect(await kit.reason(archive)).toBe(fx.ALREADY_ARCHIVED);
		expect(block.button("Send back").disabled).toBe(false);
	});
});

describe("states", () => {
	test("a resolved card keeps the workspace and drops every action", () => {
		const block = mount({ ...cloud, done: true });
		expect(block.getByText("agent/next-invoice-date")).toBeTruthy();
		for (const name of ["Send back", "Archive workspace", "Open workspace"])
			expect(names(block)).not.toContain(name);
	});

	test("while an action runs, none can be taken", async () => {
		const block = mount({ ...cloud, pending: true });
		expect(block.button("Send back").disabled).toBe(true);
		expect(block.button("Archive workspace").disabled).toBe(true);
		await kit.act(async () => {
			kit.fireEvent.click(block.button("Send back"));
		});
		expect(block.queryByLabelText(fx.FEEDBACK_INPUT)).toBeNull();
	});

	test("the failure sentence is shown above the actions", () => {
		const block = mount({ failure: "Write what the agent should change" });
		expect(block.getByText("Write what the agent should change")).toBeTruthy();
		expect(block.button("Send back").disabled).toBe(false);
	});

	test("a very long name and branch are in the page in full", () => {
		const block = mount({ view: fx.finishedLongLocalView });
		expect(block.getByText(fx.LONG_BRANCH)).toBeTruthy();
		expect(block.getAllByTitle(fx.LONG_NAME).length).toBeGreaterThan(0);
	});
});
