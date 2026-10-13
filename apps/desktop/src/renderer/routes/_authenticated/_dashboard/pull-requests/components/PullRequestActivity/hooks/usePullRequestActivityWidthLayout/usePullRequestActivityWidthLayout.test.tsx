import { afterEach, describe, expect, test } from "bun:test";
import { cleanup, render } from "@testing-library/react";
import { usePullRequestActivityWidthLayout } from "./usePullRequestActivityWidthLayout";

afterEach(cleanup);

function Harness({ show }: { show: boolean }) {
	const { ref, layout } = usePullRequestActivityWidthLayout();
	return show ? (
		<section ref={ref} data-testid="section" data-layout={layout} />
	) : null;
}

function withClientWidth<T>(width: number, run: () => T): T {
	const original = Object.getOwnPropertyDescriptor(
		HTMLElement.prototype,
		"clientWidth",
	);
	Object.defineProperty(HTMLElement.prototype, "clientWidth", {
		configurable: true,
		get: () => width,
	});
	try {
		return run();
	} finally {
		if (original)
			Object.defineProperty(HTMLElement.prototype, "clientWidth", original);
	}
}

describe("activity width layout", () => {
	test("a narrow section that mounts after the first render still folds to rows", () => {
		withClientWidth(360, () => {
			const view = render(<Harness show={false} />);
			view.rerender(<Harness show />);
			expect(view.getByTestId("section").dataset.layout).toBe("row");
		});
	});

	test("a wide section keeps the cards", () => {
		withClientWidth(900, () => {
			const view = render(<Harness show />);
			expect(view.getByTestId("section").dataset.layout).toBe("card");
		});
	});
});
