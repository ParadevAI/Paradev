import { expect, test } from "bun:test";
import { FINISHED_LIMIT, useActivityPanelStore } from "./activityPanelStore";

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

test("hiding the docked card is per workspace", () => {
	const { setHidden } = useActivityPanelStore.getState();
	setHidden("ws-a", true);
	expect(useActivityPanelStore.getState().hidden["ws-a"]).toBe(true);
	expect(useActivityPanelStore.getState().hidden["ws-b"]).toBeUndefined();
	setHidden("ws-a", false);
	expect("ws-a" in useActivityPanelStore.getState().hidden).toBe(false);
});
