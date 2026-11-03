import { beforeEach, describe, expect, test } from "bun:test";
import {
	lastActiveChatComposer,
	useChatComposerStore,
} from "./chatComposerStore";

const target = () => ({ addFiles: () => {} });
const lastActive = (workspaceId: string) =>
	lastActiveChatComposer(
		useChatComposerStore.getState().composers,
		workspaceId,
	);

describe("lastActiveChatComposer", () => {
	beforeEach(() => useChatComposerStore.setState({ composers: {} }));

	test("picks the composer focused last; mounting does not count", () => {
		const a = target();
		const b = target();
		const store = useChatComposerStore.getState();
		store.register("a", "ws1", a);
		store.register("b", "ws1", b);
		store.register("other", "ws2", target());
		store.markActive("b");
		store.markActive("a");
		store.markActive("other");
		store.register("late", "ws1", target());
		expect(lastActive("ws1")).toBe(a);

		store.unregister("a");
		expect(lastActive("ws1")).toBe(b);
		expect(lastActive("ws3")).toBeNull();
	});
});
