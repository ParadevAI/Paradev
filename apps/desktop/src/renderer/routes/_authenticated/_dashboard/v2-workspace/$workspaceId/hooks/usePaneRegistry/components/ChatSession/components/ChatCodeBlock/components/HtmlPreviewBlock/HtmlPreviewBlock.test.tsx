import { afterAll, afterEach, beforeAll, expect, test } from "bun:test";
import { ChatMarkdown } from "@superset/chat-ui/ChatMarkdown";
import { cleanup, fireEvent, render } from "@testing-library/react";
import { ChatCodeBlock } from "../../ChatCodeBlock";

// File icons resolve against the page URL, and the test DOM starts on
// about:blank. The DOM would also try to load the frame, whose scheme only
// the desktop's main process serves.
const page = (
	window as unknown as {
		happyDOM: {
			setURL: (url: string) => void;
			settings: { navigation: { disableChildFrameNavigation: boolean } };
		};
	}
).happyDOM;
beforeAll(() => {
	page.setURL("http://localhost/");
	page.settings.navigation.disableChildFrameNavigation = true;
});
afterAll(() => {
	page.setURL("about:blank");
	page.settings.navigation.disableChildFrameNavigation = false;
});
afterEach(cleanup);

const renderHtml = (markdown: string) =>
	render(
		<ChatMarkdown components={{ code: ChatCodeBlock }}>
			{markdown}
		</ChatMarkdown>,
	);

test("shows a closed fence in a sandboxed frame served from the preview scheme", () => {
	const view = renderHtml("```html\n<p>Hi</p>\n```\n");
	const frame = view.container.querySelector("iframe");
	expect(frame?.getAttribute("sandbox")).toBe("allow-scripts");
	expect(frame?.getAttribute("src")).toStartWith(
		"superset-preview://document/?d=",
	);
	expect(view.getByRole("button", { name: "Open full screen" })).toBeTruthy();
	expect(view.getByRole("button", { name: "Zoom" }).textContent).toContain(
		"Fit",
	);

	fireEvent.click(view.getByRole("button", { name: "Code" }));
	expect(view.container.querySelector("iframe")).toBeNull();
	expect(view.getByRole("button", { name: "Wrap lines" })).toBeTruthy();
});

test("shows the code and no frame while the fence is still open", () => {
	const view = renderHtml("```html\n<p>Hi</p>\n");
	expect(view.container.querySelector("iframe")).toBeNull();
	expect(view.queryByRole("group", { name: "View" })).toBeNull();
});
