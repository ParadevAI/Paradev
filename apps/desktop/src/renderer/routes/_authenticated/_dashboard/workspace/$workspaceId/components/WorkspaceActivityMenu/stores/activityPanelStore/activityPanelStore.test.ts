import { afterEach, expect, test } from "bun:test";
import {
	FINISHED_LIMIT,
	useActivityPanelStore,
	useActivityPanelVisibilityStore,
} from "./activityPanelStore";

afterEach(() => {
	useActivityPanelVisibilityStore.getState().setHidden(false);
	localStorage.removeItem("workspace-activity-panel");
});

const finished = (n: number) => ({
	key: `chat:${n}`,
	name: `agent ${n}`,
	terminalId: "chat",
	taskId: `${n}`,
});

test("finished subagents are newest first, deduplicated and capped", () => {
	const { recordFinished } = useActivityPanelStore.getState();
	for (let n = 0; n < FINISHED_LIMIT + 5; n++)
		recordFinished("ws-cap", [finished(n)]);
	recordFinished("ws-cap", [finished(FINISHED_LIMIT + 4)]);
	const list = useActivityPanelStore.getState().finished["ws-cap"] ?? [];
	expect(list).toHaveLength(FINISHED_LIMIT);
	expect(list[0]?.key).toBe(`chat:${FINISHED_LIMIT + 4}`);
	expect(new Set(list.map((entry) => entry.key)).size).toBe(FINISHED_LIMIT);
});

test("an aside only clears the slot it still owns", () => {
	const { setAsideNode, clearAsideNode } = useActivityPanelStore.getState();
	const first = {} as HTMLElement;
	const second = {} as HTMLElement;
	setAsideNode("ws-aside", first);
	setAsideNode("ws-aside", second);
	clearAsideNode("ws-aside", first);
	expect(useActivityPanelStore.getState().asideNodes["ws-aside"]).toBe(second);
	clearAsideNode("ws-aside", second);
	expect(
		useActivityPanelStore.getState().asideNodes["ws-aside"],
	).toBeUndefined();
});

test("fits and stopped keys are tracked per call and cleared on demand", () => {
	const { setFits, noteStopped, forgetStopped } =
		useActivityPanelStore.getState();
	setFits("ws-fit", true);
	expect(useActivityPanelStore.getState().fits["ws-fit"]).toBe(true);
	setFits("ws-fit", false);
	expect(useActivityPanelStore.getState().fits["ws-fit"]).toBeUndefined();
	noteStopped("chat:1");
	expect(useActivityPanelStore.getState().stoppedKeys.has("chat:1")).toBe(true);
	forgetStopped(["chat:1"]);
	expect(useActivityPanelStore.getState().stoppedKeys.has("chat:1")).toBe(
		false,
	);
});

test.each([
	true,
	false,
])("restores the shared hidden preference: %s", async (hidden) => {
	useActivityPanelVisibilityStore.getState().setHidden(hidden);
	const saved = localStorage.getItem("workspace-activity-panel");
	expect(JSON.parse(saved ?? "null")).toEqual({
		state: { hidden },
		version: 0,
	});

	useActivityPanelVisibilityStore.setState({ hidden: !hidden });
	localStorage.setItem("workspace-activity-panel", saved as string);
	await useActivityPanelVisibilityStore.persist.rehydrate();

	expect(useActivityPanelVisibilityStore.getState().hidden).toBe(hidden);
});

test("the floating popover stays open per workspace and closing removes the key", () => {
	useActivityPanelVisibilityStore.getState().setHidden(true);
	const { setFloatingOpen } = useActivityPanelStore.getState();
	setFloatingOpen("ws-a", true);
	expect(useActivityPanelStore.getState().floatingOpen["ws-a"]).toBe(true);
	expect(useActivityPanelStore.getState().floatingOpen["ws-b"]).toBeUndefined();
	setFloatingOpen("ws-a", false);
	expect("ws-a" in useActivityPanelStore.getState().floatingOpen).toBe(false);
	expect(useActivityPanelVisibilityStore.getState().hidden).toBe(true);
});

test("collapsing the subagents group is per workspace", () => {
	const { setSubagentsCollapsed } = useActivityPanelStore.getState();
	setSubagentsCollapsed("ws-a", true);
	expect(useActivityPanelStore.getState().subagentsCollapsed["ws-a"]).toBe(
		true,
	);
	expect(
		useActivityPanelStore.getState().subagentsCollapsed["ws-b"],
	).toBeUndefined();
	setSubagentsCollapsed("ws-a", false);
	expect("ws-a" in useActivityPanelStore.getState().subagentsCollapsed).toBe(
		false,
	);
});
