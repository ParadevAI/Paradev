import { afterAll, afterEach, beforeAll, expect, mock, test } from "bun:test";
import { ChatMarkdown } from "@superset/chat-ui/ChatMarkdown";
import { cleanup, fireEvent, render } from "@testing-library/react";
import {
	ChatPaneActionsProvider,
	type OpenLink,
} from "../../providers/ChatPaneActionsProvider";
import { ChatCodeBlock } from "./ChatCodeBlock";

// File icons resolve against the page URL, and the test DOM starts on about:blank.
const page = (
	window as unknown as { happyDOM: { setURL: (url: string) => void } }
).happyDOM;
beforeAll(() => page.setURL("http://localhost/"));
afterAll(() => page.setURL("about:blank"));
afterEach(cleanup);

function renderFence(info: string, openLink?: OpenLink) {
	return render(
		<ChatPaneActionsProvider openLink={openLink}>
			<ChatMarkdown components={{ code: ChatCodeBlock }}>
				{`\`\`\`${info}\nconst chunk = 1;\n\`\`\`\n`}
			</ChatMarkdown>
		</ChatPaneActionsProvider>,
	);
}

test("a fence that cites a file opens it at the first cited line", () => {
	const openLink = mock<OpenLink>(() => true);
	const view = renderFence("994:1002:src/harness/AcpAdapter.ts", openLink);
	const path = view.getByRole("button", { name: "src/harness/AcpAdapter.ts" });
	expect(path.title).toBe("src/harness/AcpAdapter.ts");
	expect(path.previousElementSibling?.getAttribute("src")).toContain(
		"file-icons/",
	);
	expect(view.getByRole("button", { name: "Copy code" })).toBeTruthy();

	fireEvent.click(path);
	expect(openLink.mock.calls.map(([href]) => href)).toEqual([
		"src/harness/AcpAdapter.ts:994",
	]);
});

test("a fence that names a language and a path shows the path", () => {
	const view = renderFence("ts:src/app.ts");
	expect(view.getByTitle("src/app.ts").tagName).toBe("SPAN");
	expect(
		view.container
			.querySelector("[data-chat-code-block]")
			?.getAttribute("data-chat-code-block"),
	).toBe("ts");
});

test("a fence that names only a language shows the language's name and icon", () => {
	const view = renderFence("ts");
	const label = view.getByText("TypeScript");
	expect(label.previousElementSibling?.getAttribute("src")).toContain(
		"file-icons/",
	);
});

test("a plain text or unmarked fence is labelled as plain text", () => {
	for (const info of ["text", ""]) {
		const view = renderFence(info);
		expect(view.getByText("Plain text")).toBeTruthy();
		expect(view.container.querySelector("img")).toBeNull();
		view.unmount();
	}
});

test("lines scroll sideways until the reader asks for them to wrap", () => {
	const view = renderFence("text");
	const overflow = () =>
		[...view.container.querySelectorAll("*")]
			.find((element) => element.shadowRoot)
			?.shadowRoot?.querySelector("pre")
			?.getAttribute("data-overflow");
	const toggle = view.getByRole("button", { name: "Wrap lines" });
	expect(toggle.getAttribute("aria-pressed")).toBe("false");
	expect(overflow()).toBe("scroll");

	fireEvent.click(toggle);
	expect(toggle.getAttribute("aria-pressed")).toBe("true");
	expect(overflow()).toBe("wrap");
});
