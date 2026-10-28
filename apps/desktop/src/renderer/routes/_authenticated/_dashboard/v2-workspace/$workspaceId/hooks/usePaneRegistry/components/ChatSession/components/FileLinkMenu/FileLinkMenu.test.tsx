import { afterEach, expect, mock, test } from "bun:test";
import {
	cleanup,
	fireEvent,
	render,
	screen,
	waitFor,
} from "@testing-library/react";
import {
	ChatPaneActionsProvider,
	type OpenLink,
} from "../../providers/ChatPaneActionsProvider";
import { FileLinkMenu } from "./FileLinkMenu";

afterEach(cleanup);

function renderMenu(openLink?: OpenLink) {
	render(
		<ChatPaneActionsProvider openLink={openLink}>
			<FileLinkMenu reference="src/auth.ts:42">
				<span>auth.ts:42</span>
			</FileLinkMenu>
		</ChatPaneActionsProvider>,
	);
	return screen.getByText("auth.ts:42");
}

test("each destination opens the reference with that action", async () => {
	const openLink = mock<OpenLink>(() => true);
	fireEvent.contextMenu(renderMenu(openLink));
	const openIn = await screen.findByText("Open in");
	fireEvent.keyDown(openIn, { key: "ArrowRight" });
	fireEvent.click(await screen.findByText("Editor"));
	expect(openLink.mock.calls.map(([href, , action]) => [href, action])).toEqual(
		[["src/auth.ts:42", "external"]],
	);
});

test("copy puts the reference with its line on the clipboard", async () => {
	const writes: string[] = [];
	const original = Object.getOwnPropertyDescriptor(navigator, "clipboard");
	Object.defineProperty(navigator, "clipboard", {
		configurable: true,
		value: { writeText: async (text: string) => void writes.push(text) },
	});
	try {
		fireEvent.contextMenu(renderMenu(() => true));
		fireEvent.click(await screen.findByText("Copy Path"));
		await waitFor(() => expect(writes).toEqual(["src/auth.ts:42"]));
	} finally {
		if (original) Object.defineProperty(navigator, "clipboard", original);
		else Reflect.deleteProperty(navigator, "clipboard");
	}
});

test("without a pane to open into there is no menu", () => {
	fireEvent.contextMenu(renderMenu());
	expect(screen.queryByText("Open in")).toBeNull();
});
