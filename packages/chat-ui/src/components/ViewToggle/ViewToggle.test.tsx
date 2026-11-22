import { afterAll, afterEach, expect, test } from "bun:test";
import { GlobalRegistrator } from "@happy-dom/global-registrator";

const alreadyRegistered = GlobalRegistrator.isRegistered;
if (!alreadyRegistered) GlobalRegistrator.register();
(
	globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

const { cleanup, fireEvent, render } = await import("@testing-library/react");
const { ViewToggle } = await import("./ViewToggle");

afterEach(cleanup);
afterAll(async () => {
	if (!alreadyRegistered) await GlobalRegistrator.unregister();
});

test("presses the current view and reports the other one on click", () => {
	const chosen: string[] = [];
	const view = render(
		<ViewToggle
			label="View"
			onChange={(value) => chosen.push(value)}
			options={[
				{ value: "code", label: "Code" },
				{ value: "diagram", label: "Diagram" },
			]}
			value="diagram"
		/>,
	);
	expect(
		view.getByRole("button", { name: "Diagram", pressed: true }),
	).toBeTruthy();
	fireEvent.click(view.getByRole("button", { name: "Code", pressed: false }));
	expect(chosen).toEqual(["code"]);
});
