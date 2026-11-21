import { afterAll, afterEach, beforeAll, expect, mock, test } from "bun:test";
import { ChatMarkdown } from "@superset/chat-ui/ChatMarkdown";
import { cleanup, fireEvent, render } from "@testing-library/react";
import {
	ChatPaneActionsProvider,
	type OpenLink,
} from "../../providers/ChatPaneActionsProvider";
import { remarkLocalPathLinks } from "../../utils/remarkLocalPathLinks";
import { ChatLink } from "../ChatLink";
import { ChatInlineCode } from "./ChatInlineCode";

// File icons resolve against the page URL, and the test DOM starts on about:blank.
const page = (
	window as unknown as { happyDOM: { setURL: (url: string) => void } }
).happyDOM;
beforeAll(() => page.setURL("http://localhost/"));
afterAll(() => page.setURL("about:blank"));
afterEach(cleanup);

function renderProse(markdown: string, openLink?: OpenLink) {
	return render(
		<ChatPaneActionsProvider openLink={openLink}>
			<ChatMarkdown
				components={{ inlineCode: ChatInlineCode, a: ChatLink }}
				remarkPlugins={[remarkLocalPathLinks]}
			>
				{markdown}
			</ChatMarkdown>
		</ChatPaneActionsProvider>,
	);
}

test("a path in inline code gets a file icon, other code does not", () => {
	const view = renderProse("See `src/app.ts:12` and call `useState`.");
	const [path, hook] = [...view.container.querySelectorAll("code")];
	expect(path?.querySelector("img")?.getAttribute("src")).toContain(
		"file-icons/",
	);
	expect(path?.textContent).toBe("src/app.ts:12");
	expect(path?.getAttribute("role")).toBeNull();
	expect(hook?.querySelector("img")).toBeNull();
	expect(hook?.className).toContain("py-0.5");
});

test("a path opens with its line position on click, Enter and Space", () => {
	const openLink = mock<OpenLink>(() => true);
	const view = renderProse("Look at `src/app.ts#L12-L20`.", openLink);
	const chip = view.getByRole("link");
	expect(chip.tabIndex).toBe(0);

	fireEvent.click(chip);
	fireEvent.keyDown(chip, { key: "Enter" });
	fireEvent.keyDown(chip, { key: " " });
	fireEvent.keyDown(chip, { key: "a" });
	expect(openLink.mock.calls.map(([href]) => href)).toEqual([
		"src/app.ts#L12-L20",
		"src/app.ts#L12-L20",
		"src/app.ts#L12-L20",
	]);
});

test("a path on the web shows its icon and stays inert", () => {
	const openLink = mock<OpenLink>(() => true);
	const view = renderProse("`https://example.com/install.sh`", openLink);
	expect(view.container.querySelector("code img")).not.toBeNull();
	expect(view.queryByRole("link")).toBeNull();
});

test("inline code inside a link leaves navigation to its destination", () => {
	const openLink = mock<OpenLink>(() => true);
	const view = renderProse("[`app.ts`](src/app.ts:42)", openLink);
	view.container.addEventListener("click", (event) => event.preventDefault(), {
		capture: true,
	});
	const code = view.container.querySelector("code") as HTMLElement;
	expect(view.getByRole("link").querySelectorAll("img")).toHaveLength(1);
	expect(code.className).toContain("bg-transparent");
	expect(code.className).toContain("p-0");
	fireEvent.click(code);
	expect(openLink.mock.calls.map(([href]) => href)).toEqual(["src/app.ts:42"]);
	expect(code.getAttribute("role")).toBeNull();
	expect(code.getAttribute("tabindex")).toBeNull();
});
