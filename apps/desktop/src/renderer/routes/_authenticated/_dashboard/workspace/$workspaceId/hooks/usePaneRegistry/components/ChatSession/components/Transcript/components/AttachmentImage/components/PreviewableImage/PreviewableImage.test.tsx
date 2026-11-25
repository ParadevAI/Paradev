import { afterAll, afterEach, describe, expect, mock, test } from "bun:test";
import { GlobalRegistrator } from "@happy-dom/global-registrator";

const alreadyRegistered = GlobalRegistrator.isRegistered;
if (!alreadyRegistered) GlobalRegistrator.register();
(
	globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

const { cleanup, fireEvent, render } = await import("@testing-library/react");
const { PreviewableImage } = await import("./PreviewableImage");

afterEach(cleanup);
afterAll(async () => {
	if (!alreadyRegistered) await GlobalRegistrator.unregister();
});

const SRC = "data:image/png;base64,iVBORw0KGgo=";

describe("PreviewableImage", () => {
	test("asks to open the preview on click", () => {
		const onClick = mock(() => {});
		const view = render(
			<PreviewableImage
				filename="shot.png"
				onClick={onClick}
				onError={mock(() => {})}
				src={SRC}
			/>,
		);
		expect(view.getByAltText("shot.png").getAttribute("src")).toBe(SRC);
		fireEvent.click(view.getByRole("button", { name: "Preview shot.png" }));
		expect(onClick).toHaveBeenCalledTimes(1);
	});

	test("draws no border of its own around the thumbnail", () => {
		const view = render(
			<PreviewableImage
				filename="shot.png"
				onClick={mock(() => {})}
				onError={mock(() => {})}
				src={SRC}
			/>,
		);
		const thumbnail = view.getByRole("button", { name: "Preview shot.png" });
		for (const element of [thumbnail, ...thumbnail.querySelectorAll("*")])
			expect(element.className).not.toMatch(/\bborder\b/);
	});
});
