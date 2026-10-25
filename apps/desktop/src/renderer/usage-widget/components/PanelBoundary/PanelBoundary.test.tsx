import { afterEach, expect, spyOn, test } from "bun:test";
import { cleanup, fireEvent, render } from "@testing-library/react";
import { PanelBoundary } from "./PanelBoundary";

afterEach(cleanup);

test("a failed usage child offers local reload without application providers", () => {
	const error = spyOn(console, "error").mockImplementation(() => {});
	const reload = spyOn(window.location, "reload").mockImplementation(() => {});
	function FailedChild(): never {
		throw new Error("owned usage fixture");
	}
	try {
		const view = render(
			<PanelBoundary>
				<FailedChild />
			</PanelBoundary>,
		);
		expect(view.getByRole("alert").textContent).toContain(
			"Could not load accounts. Refresh to try again.",
		);
		fireEvent.click(view.getByRole("button", { name: "Retry" }));
		expect(reload).toHaveBeenCalledTimes(1);
	} finally {
		error.mockRestore();
		reload.mockRestore();
	}
});
