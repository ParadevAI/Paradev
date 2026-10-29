import { afterAll, afterEach, expect, test } from "bun:test";
import { GlobalRegistrator } from "@happy-dom/global-registrator";

const alreadyRegistered = GlobalRegistrator.isRegistered;
if (!alreadyRegistered) GlobalRegistrator.register();
(
	globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

const { useRef } = await import("react");
const { createPortal } = await import("react-dom");
const { cleanup, fireEvent, render } = await import("@testing-library/react");
const { useModalOverlay } = await import("./useModalOverlay");

afterEach(cleanup);
afterAll(async () => {
	if (!alreadyRegistered) await GlobalRegistrator.unregister();
});

function Overlay({ onClose }: { onClose: () => void }) {
	const ref = useRef<HTMLDivElement>(null);
	useModalOverlay(ref, onClose);
	return createPortal(
		<div data-testid="overlay" ref={ref} role="dialog" tabIndex={-1} />,
		document.body,
	);
}

test("makes the rest of the page inert, closes on Escape and gives focus back", () => {
	const opener = document.createElement("button");
	document.body.append(opener);
	opener.focus();
	const closed: string[] = [];
	const view = render(<Overlay onClose={() => closed.push("first")} />);

	expect(opener.hasAttribute("inert")).toBe(true);
	expect(view.getByTestId("overlay").hasAttribute("inert")).toBe(false);
	expect(document.activeElement).toBe(view.getByTestId("overlay"));

	view.rerender(<Overlay onClose={() => closed.push("second")} />);
	fireEvent.keyDown(window, { key: "Escape" });
	expect(closed).toEqual(["second"]);

	view.unmount();
	expect(opener.hasAttribute("inert")).toBe(false);
	expect(document.activeElement).toBe(opener);
	opener.remove();
});
