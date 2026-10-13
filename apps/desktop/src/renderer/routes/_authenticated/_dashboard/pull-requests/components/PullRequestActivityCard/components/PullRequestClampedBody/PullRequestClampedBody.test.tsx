import { afterEach, describe, expect, test } from "bun:test";
import { cleanup, fireEvent, render } from "@testing-library/react";
import { PullRequestClampedBody } from "./PullRequestClampedBody";

afterEach(cleanup);

function renderWithHeight(scrollHeight: number) {
	const original = Object.getOwnPropertyDescriptor(
		HTMLElement.prototype,
		"scrollHeight",
	);
	Object.defineProperty(HTMLElement.prototype, "scrollHeight", {
		configurable: true,
		get: () => scrollHeight,
	});
	try {
		return render(
			<PullRequestClampedBody>
				<p>Body</p>
			</PullRequestClampedBody>,
		);
	} finally {
		if (original)
			Object.defineProperty(HTMLElement.prototype, "scrollHeight", original);
	}
}

describe("clamped comment bodies", () => {
	test("a short body shows in full with no control", () => {
		const view = renderWithHeight(200);
		expect(view.queryByRole("button")).toBeNull();
		expect(
			view.getByText("Body").parentElement?.parentElement?.style.maxHeight,
		).toBe("");
	});

	test("a long body folds until Show more, and Show less folds it again", () => {
		const view = renderWithHeight(600);
		const clamp = view.getByText("Body").parentElement?.parentElement;
		expect(clamp?.style.maxHeight).toBe("180px");
		const toggle = view.getByRole("button", { name: "Show more" });
		expect(toggle.getAttribute("aria-expanded")).toBe("false");
		fireEvent.click(toggle);
		expect(clamp?.style.maxHeight).toBe("");
		fireEvent.click(view.getByRole("button", { name: "Show less" }));
		expect(clamp?.style.maxHeight).toBe("180px");
	});
});
