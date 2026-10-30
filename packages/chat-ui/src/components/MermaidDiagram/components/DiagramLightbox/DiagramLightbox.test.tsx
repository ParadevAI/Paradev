import { afterAll, afterEach, expect, test } from "bun:test";
import { GlobalRegistrator } from "@happy-dom/global-registrator";

const alreadyRegistered = GlobalRegistrator.isRegistered;
if (!alreadyRegistered) GlobalRegistrator.register();
(
	globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

const { cleanup, fireEvent, render } = await import("@testing-library/react");
const { DiagramLightbox } = await import("./DiagramLightbox");

afterEach(cleanup);
afterAll(async () => {
	if (!alreadyRegistered) await GlobalRegistrator.unregister();
});

const SVG = '<svg viewBox="0 0 200 100"><rect width="200" height="100"/></svg>';

const scaleOf = (view: ReturnType<typeof render>) =>
	Number(
		view.baseElement
			.querySelector("[data-diagram-scale]")
			?.getAttribute("data-diagram-scale"),
	);

test("zooms with the buttons and closes on Escape", () => {
	const closes: number[] = [];
	const view = render(
		<DiagramLightbox
			label="Diagram"
			onClose={() => closes.push(1)}
			svg={SVG}
		/>,
	);
	const before = scaleOf(view);
	fireEvent.click(view.getByRole("button", { name: "Zoom in" }));
	expect(scaleOf(view)).toBeCloseTo(before * 1.25);
	fireEvent.click(view.getByRole("button", { name: "Reset zoom" }));
	expect(scaleOf(view)).toBeCloseTo(before);

	fireEvent.keyDown(window, { key: "Escape" });
	expect(closes).toEqual([1]);
});
