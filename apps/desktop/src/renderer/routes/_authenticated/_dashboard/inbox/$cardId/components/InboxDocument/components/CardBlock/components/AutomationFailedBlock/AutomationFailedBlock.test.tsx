import { supersetTestKit } from "../supersetTestKit";

const kit = await supersetTestKit();
const { describe, expect, test } = await import("bun:test");
const { formatDate } = await import("@superset/i18n/format");
const fx = await import("../supersetFixtures");
const { AutomationFailedBlock } = await import("./AutomationFailedBlock");

type Props = Parameters<typeof AutomationFailedBlock>[0];
const mount = (props: Partial<Props> = {}) =>
	kit.mount(AutomationFailedBlock, {
		view: fx.automationFailedView,
		actions: fx.automationActions,
		...props,
	});
const when = (iso: string | null) =>
	new RegExp(
		formatDate(new Date(iso ?? ""), {
			dateStyle: "medium",
			timeStyle: "short",
		}),
	);
const run = fx.automationFailedView.run;
const names = (block: ReturnType<typeof mount>) =>
	block.getAllByRole("button").map((button) => button.textContent);
const HISTORY = [
	{
		to: "/automations/$automationId",
		params: { automationId: fx.automationFailedView.automation.id },
		search: { history: true },
	},
];

describe("the run", () => {
	test("a failed run: its title, status, device, scheduled time, the host's error and what to do", () => {
		const block = mount();
		expect(block.getByText("Triage new Sentry issues")).toBeTruthy();
		expect(block.getByText("failed")).toBeTruthy();
		expect(block.getByText(/Mira's MacBook Pro/)).toBeTruthy();
		expect(block.getByText(when(run.scheduledFor))).toBeTruthy();
		expect(block.queryByText(when(run.createdAt))).toBeNull();
		expect(block.container.querySelector("pre")?.textContent).toBe(
			fx.automationFailedView.run.error ?? "",
		);
		expect(
			block.getByText(/Re-select an agent in the automation's settings\./),
		).toBeTruthy();
		expect(block.queryByText("Since then")).toBeNull();
	});

	test("a run that never started: the automation's name, missed, no error box, and how to bring the host back", () => {
		const block = mount({ view: fx.automationSkippedView });
		expect(block.getByText("Triage new Sentry issues")).toBeTruthy();
		expect(block.getByText("missed")).toBeTruthy();
		expect(block.container.querySelector("pre")).toBeNull();
		expect(
			block.getByText(/The host isn't connected to the Superset relay\./),
		).toBeTruthy();
		expect(block.getByText(when(run.createdAt))).toBeTruthy();
	});

	test("a cloud automation says Cloud", () => {
		const block = mount({ view: fx.automationCloudView });
		expect(block.getByText(/^Cloud/)).toBeTruthy();
		expect(block.queryByText(/MacBook/)).toBeNull();
	});

	test("an unnamed device, an unknown status and an error with no code", () => {
		const block = mount({ view: fx.automationUnknownView });
		expect(block.getByText(/^A device/)).toBeTruthy();
		expect(block.container.querySelector("pre")?.textContent).toBe(
			"exit status 137",
		);
		expect(block.container.querySelectorAll("p").length).toBe(0);
		expect(block.getByRole("button", { name: "timed_out" })).toBeTruthy();
	});
});

describe("later runs", () => {
	test("each later run with its status; one that ran opens, one that did not is off", async () => {
		const block = mount({ view: fx.automationRecoveredView });
		expect(block.getByText("Since then")).toBeTruthy();
		const created = block.button("created");
		const missed = block.button("missed");
		expect(created.disabled).toBe(false);
		expect(missed.disabled).toBe(true);
		await kit.act(async () => {
			kit.fireEvent.click(missed);
		});
		expect(kit.navigate).not.toHaveBeenCalled();
		await kit.act(async () => {
			kit.fireEvent.click(created);
		});
		expect(kit.navigate.mock.calls).toEqual([
			[
				{
					to: "/cloud-workspaces/$workspaceId",
					params: { workspaceId: fx.laterCloudSession.workspaceId },
				},
			],
		]);
		expect(block.onAct).not.toHaveBeenCalled();
	});
});

describe("open run", () => {
	test("a run on a device opens its workspace at the run's terminal", async () => {
		const block = mount();
		await block.click("Open run");
		expect(kit.navigate.mock.calls).toEqual([
			[
				{
					to: "/v2-workspace/$workspaceId",
					params: { workspaceId: fx.failedSession.workspaceId },
					search: { terminalId: fx.failedSession.terminalId },
				},
			],
		]);
		expect(localStorage.getItem("lastViewedWorkspaceId")).toBe(
			fx.failedSession.workspaceId,
		);
	});

	test("a run that never started opens the automation's history", async () => {
		const block = mount({ view: fx.automationSkippedView });
		await block.click("Open run");
		expect(kit.navigate.mock.calls).toEqual([HISTORY]);
	});

	test("a cloud run opens its cloud workspace", async () => {
		const block = mount({ view: fx.automationCloudView });
		await block.click("Open run");
		expect(kit.navigate.mock.calls[0]?.[0]).toMatchObject({
			to: "/cloud-workspaces/$workspaceId",
		});
	});
});

describe("retry", () => {
	test("runs the automation again at once", async () => {
		const block = mount();
		await block.click("Retry");
		expect(block.onAct.mock.calls).toEqual([["retry"]]);
	});

	test("someone who is not the owner cannot retry, and is told why", async () => {
		const block = mount({ actions: fx.automationNotOwnerActions });
		const retry = block.button("Retry");
		expect(retry.disabled).toBe(true);
		await kit.act(async () => {
			kit.fireEvent.click(retry);
		});
		expect(block.onAct).not.toHaveBeenCalled();
		expect(await kit.reason(retry)).toBe(fx.NOT_OWNER);
		expect(block.button("Open run").disabled).toBe(false);
	});
});

describe("states", () => {
	test("a resolved card keeps the run and drops Retry and Open run", () => {
		const block = mount({ view: fx.automationRecoveredView, done: true });
		expect(block.container.querySelector("pre")).toBeTruthy();
		expect(names(block)).toEqual(["created", "missed"]);
	});

	test("while Retry runs it cannot be pressed again", async () => {
		const block = mount({ pending: true });
		expect(block.button("Retry").disabled).toBe(true);
		await kit.act(async () => {
			kit.fireEvent.click(block.button("Retry"));
		});
		expect(block.onAct).not.toHaveBeenCalled();
	});

	test("the failure sentence is shown above the actions", () => {
		const block = mount({
			failure: "A run of this automation is already in progress",
		});
		expect(
			block.getByText("A run of this automation is already in progress"),
		).toBeTruthy();
	});

	test("a very long title and error are in the page in full", () => {
		const block = mount({ view: fx.automationLongView });
		expect(block.getByText(fx.LONG_NAME)).toBeTruthy();
		expect(block.container.querySelector("pre")?.textContent).toBe(
			fx.automationLongView.run.error ?? "",
		);
		expect(block.container.querySelector("pre")?.className).toContain(
			"break-words",
		);
	});
});
