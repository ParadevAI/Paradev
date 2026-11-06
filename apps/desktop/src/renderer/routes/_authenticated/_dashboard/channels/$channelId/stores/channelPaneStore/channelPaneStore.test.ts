import { beforeEach, describe, expect, test } from "bun:test";
import { useChannelPaneStore } from "./channelPaneStore";

const thread = (id: string) => ({ kind: "thread" as const, id });
const pane = (id = "c") => useChannelPaneStore.getState().panes[id];

describe("channel pane store", () => {
	beforeEach(() => useChannelPaneStore.setState({ panes: {}, width: null }));

	test("pushing a page opens the pane with it on top", () => {
		useChannelPaneStore.getState().push("c", thread("a"));
		expect(pane()?.isOpen).toBe(true);
		expect(pane()?.stack).toEqual([thread("a")]);
	});

	test("another page of the same kind replaces the top instead of stacking", () => {
		const { push } = useChannelPaneStore.getState();
		push("c", { kind: "members" });
		push("c", thread("a"));
		push("c", thread("b"));
		expect(pane()?.stack).toEqual([{ kind: "members" }, thread("b")]);
	});

	test("pushing the page already on top only opens the pane", () => {
		const { push, setOpen } = useChannelPaneStore.getState();
		push("c", thread("a"));
		setOpen("c", false);
		push("c", thread("a"));
		expect(pane()?.stack).toEqual([thread("a")]);
		expect(pane()?.isOpen).toBe(true);
	});

	test("pop goes back one page and reset returns to the root", () => {
		const { push, pop, reset } = useChannelPaneStore.getState();
		push("c", { kind: "members" });
		push("c", { kind: "profile", id: "p" });
		pop("c");
		expect(pane()?.stack).toEqual([{ kind: "members" }]);
		reset("c");
		expect(pane()?.stack).toEqual([]);
	});

	test("a deep stack keeps only its newest pages", () => {
		const { push } = useChannelPaneStore.getState();
		const kinds = [
			"members",
			"tasks",
			"settings",
			"activity",
			"routines",
		] as const;
		for (const kind of kinds) push("c", { kind });
		push("c", { kind: "profile", id: "p" });
		push("c", thread("a"));
		expect(pane()?.stack).toHaveLength(6);
		expect(pane()?.stack[0]).toEqual({ kind: "tasks" });
	});

	test("only the twenty most recently used channels keep a pane", () => {
		const { push } = useChannelPaneStore.getState();
		for (let index = 0; index < 21; index += 1) {
			useChannelPaneStore.setState((state) => ({
				panes: {
					...state.panes,
					[`c${index}`]: { stack: [], isOpen: true, touchedAt: index },
				},
			}));
		}
		push("c21", thread("a"));
		const ids = Object.keys(useChannelPaneStore.getState().panes);
		expect(ids).toHaveLength(20);
		expect(ids).not.toContain("c0");
		expect(ids).toContain("c21");
	});
});
