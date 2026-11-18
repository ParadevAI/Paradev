import { afterEach, expect, spyOn, test } from "bun:test";
import { toast } from "@superset/ui/sonner";
import { TERMINAL_BUFFER_KEY_PREFIX } from "renderer/lib/terminal/terminal-buffer-gc";
import { notifyQuotaExhausted } from "renderer/routes/_authenticated/providers/CollectionsProvider/notifyQuotaExhausted";
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

test("reports a non-quota persistence failure without offering reclaim", () => {
	const error = new DOMException("write refused", "SecurityError");
	const write = spyOn(localStorage, "setItem").mockImplementation(() => {
		throw error;
	});
	const warn = spyOn(console, "warn").mockImplementation(() => {});
	const notice = spyOn(toast, "warning").mockImplementation(() => "notice");
	try {
		expect(() =>
			useActivityPanelVisibilityStore.getState().setHidden(true),
		).not.toThrow();
		expect(useActivityPanelVisibilityStore.getState().hidden).toBe(true);
		expect(warn).toHaveBeenCalledWith(
			"[activity-panel] Failed to persist visibility:",
			error,
		);
		expect(notice).not.toHaveBeenCalled();
	} finally {
		write.mockRestore();
		warn.mockRestore();
		notice.mockRestore();
	}
});

test("offers quota reclaim and saves the latest visibility after space is freed", () => {
	const key = "workspace-activity-panel";
	const bufferKey = `${TERMINAL_BUFFER_KEY_PREFIX}activity-quota-test`;
	localStorage.setItem(bufferKey, "saved scrollback");
	const setItem = localStorage.setItem.bind(localStorage);
	const write = spyOn(localStorage, "setItem").mockImplementation(
		(name, value) => {
			if (name === key && localStorage.getItem(bufferKey) !== null) {
				throw new DOMException("storage full", "QuotaExceededError");
			}
			setItem(name, value);
		},
	);
	const warn = spyOn(console, "warn").mockImplementation(() => {});
	const notice = spyOn(toast, "warning").mockImplementation(() => "notice");
	const success = spyOn(toast, "success").mockImplementation(() => "success");
	try {
		const { setHidden } = useActivityPanelVisibilityStore.getState();
		setHidden(true);
		expect(useActivityPanelVisibilityStore.getState().hidden).toBe(true);
		expect(localStorage.getItem(key)).toBeNull();
		expect(notice).toHaveBeenCalledWith(
			"Storage is full",
			expect.objectContaining({
				action: expect.objectContaining({ label: "Free up space" }),
			}),
		);
		setHidden(false);
		notifyQuotaExhausted("another-quota-test-key");
		const action = notice.mock.calls.at(-1)?.[1]?.action;
		if (!action || typeof action !== "object" || !("onClick" in action))
			throw new Error("Missing reclaim action");
		action.onClick(
			new MouseEvent("click") as unknown as Parameters<
				typeof action.onClick
			>[0],
		);
		expect(localStorage.getItem(bufferKey)).toBeNull();
		expect(JSON.parse(localStorage.getItem(key) ?? "null")).toEqual({
			state: { hidden: false },
			version: 0,
		});
	} finally {
		write.mockRestore();
		warn.mockRestore();
		notice.mockRestore();
		success.mockRestore();
		localStorage.removeItem(bufferKey);
	}
});
