import { afterEach, expect, test } from "bun:test";

(
	globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;
const { act, cleanup, renderHook } = await import("@testing-library/react");
const { useScrolledPast } = await import("./useScrolledPast");

afterEach(cleanup);

type Observed = {
	callback: (entries: { isIntersecting: boolean }[]) => void;
	target: Element | null;
};

function installObserver() {
	const observed: Observed[] = [];
	const original = globalThis.IntersectionObserver;
	Object.assign(globalThis, {
		IntersectionObserver: class {
			private readonly entry: Observed;
			constructor(callback: Observed["callback"]) {
				this.entry = { callback, target: null };
				observed.push(this.entry);
			}
			observe(target: Element) {
				this.entry.target = target;
			}
			unobserve() {}
			disconnect() {}
		},
	});
	return {
		report(messageId: string, isIntersecting: boolean) {
			const entry = observed.findLast(
				(item) => item.target?.getAttribute("data-message-id") === messageId,
			);
			if (!entry) throw new Error(`nothing observes ${messageId}`);
			act(() => entry.callback([{ isIntersecting }]));
		},
		restore: () =>
			Object.assign(globalThis, { IntersectionObserver: original }),
	};
}

function transcript(...messageIds: string[]): HTMLElement {
	const viewport = document.createElement("div");
	for (const messageId of messageIds) {
		const row = document.createElement("div");
		row.setAttribute("data-message-id", messageId);
		viewport.append(row);
	}
	return viewport;
}

test("a new last prompt never shows with the old prompt's result", () => {
	const observer = installObserver();
	try {
		const viewport = transcript("a", "b");
		const renders: { messageId: string; scrolledPast: boolean }[] = [];
		const { rerender } = renderHook(
			({ messageId }: { messageId: string }) => {
				const scrolledPast = useScrolledPast(viewport, messageId, false);
				renders.push({ messageId, scrolledPast });
				return scrolledPast;
			},
			{ initialProps: { messageId: "a" } },
		);
		observer.report("a", false);
		expect(renders.at(-1)).toEqual({ messageId: "a", scrolledPast: true });

		rerender({ messageId: "b" });

		const forB = renders.filter((render) => render.messageId === "b");
		expect(forB.length).toBeGreaterThan(0);
		expect(forB.every((render) => !render.scrolledPast)).toBe(true);
		observer.report("b", false);
		expect(renders.at(-1)).toEqual({ messageId: "b", scrolledPast: true });
	} finally {
		observer.restore();
	}
});

test("a row the transcript window dropped counts as scrolled past from its first render", () => {
	const observer = installObserver();
	try {
		const viewport = transcript();
		const renders: boolean[] = [];
		renderHook(() => {
			const scrolledPast = useScrolledPast(viewport, "a", true);
			renders.push(scrolledPast);
			return scrolledPast;
		});
		expect(renders[0]).toBe(true);
	} finally {
		observer.restore();
	}
});
