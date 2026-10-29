import { afterEach, expect, mock, test } from "bun:test";
import type { AppRouter } from "@superset/host-service/trpc";
import {
	ContextMenu,
	ContextMenuContent,
	ContextMenuItem,
	ContextMenuTrigger,
} from "@superset/ui/context-menu";
import { workspaceTrpc } from "@superset/workspace-client";
import { QueryClient } from "@tanstack/react-query";
import {
	act,
	cleanup,
	fireEvent,
	render,
	screen,
	waitFor,
} from "@testing-library/react";
import type { TRPCLink } from "@trpc/client";
import { observable } from "@trpc/server/observable";
import { env } from "renderer/env.renderer";
import {
	linkedPrChip,
	linkedPrIconUrl,
} from "renderer/routes/_authenticated/components/AgentComposer/utils/linkedContextChips";
import {
	ChatPaneActionsProvider,
	type OpenLink,
} from "../../../../../../providers/ChatPaneActionsProvider";
import { linkChip } from "../../../../../../utils/linkChip";
import {
	elementsForChips,
	splitByElements,
} from "../../../../../../utils/messageElements";
import { copySourceText } from "../../../../utils/copySourceText";
import { UserMessageText } from "./UserMessageText";

afterEach(cleanup);

const PR = "https://github.com/superset-sh/superset/pull/8329";
const DOCS = "https://agentclientprotocol.com/protocol/content";
const LATER = "https://example.com/later";
const NOTION =
	"https://www.notion.so/acme/Roadmap-0123456789abcdef0123456789abcdef";
type Preview = {
	title: string | null;
	description: string | null;
	iconDataUrl: string | null;
	image: string | null;
};
const PREVIEW: Preview = {
	title: null,
	description: null,
	iconDataUrl: null,
	image: null,
};

function composerChip(url: string) {
	const chip = linkChip(url, {
		webUrl: env.NEXT_PUBLIC_WEB_URL,
		isDark: false,
	});
	if (!chip) throw new Error(`not a link: ${url}`);
	return chip;
}

async function renderText(
	text: string | string[],
	preview: Preview,
	openLink: OpenLink = () => true,
) {
	const asked: unknown[] = [];
	const link: TRPCLink<AppRouter> = () => (call) =>
		observable((observer) => {
			asked.push(call.op.input);
			observer.next({ result: { data: preview } });
			observer.complete();
		});
	const queryClient = new QueryClient();
	const view = render(
		<workspaceTrpc.Provider
			client={workspaceTrpc.createClient({ links: [link] })}
			queryClient={queryClient}
		>
			<ChatPaneActionsProvider openLink={openLink} workspaceId="workspace-1">
				<ContextMenu>
					<ContextMenuTrigger asChild>
						<div data-testid="messages" onCopy={copySourceText}>
							{(Array.isArray(text) ? text : [text]).map((message) => (
								<div key={message}>
									<UserMessageText segments={[{ text: message }]} />
								</div>
							))}
						</div>
					</ContextMenuTrigger>
					<ContextMenuContent>
						<ContextMenuItem>Close Pane</ContextMenuItem>
					</ContextMenuContent>
				</ContextMenu>
			</ChatPaneActionsProvider>
		</workspaceTrpc.Provider>,
	);
	const hover = async (host: string) => {
		(view.getByText(host).closest("a") as HTMLElement).focus();
		await waitFor(() => {
			expect(asked.length).toBeGreaterThan(0);
			expect(queryClient.isFetching()).toBe(0);
		});
	};
	return { asked, view, hover };
}

test("every link is drawn as the composer's chip, and nothing is fetched until hover", async () => {
	const { asked, view, hover } = await renderText(
		`Look at ${PR} and ${NOTION}\nthen ${LATER}.`,
		{ title: "Roadmap", description: null, iconDataUrl: null, image: null },
	);
	await act(async () => {});
	expect(asked).toEqual([]);
	for (const url of [PR, NOTION, LATER]) {
		const drawn = composerChip(url);
		const shown = view.getByText(drawn.label).closest("a");
		expect(shown?.href).toBe(url);
		expect(
			shown?.querySelector(".prompt-input-chip img")?.getAttribute("src"),
		).toBe(drawn.iconUrl ?? null);
	}
	expect(view.container.textContent).toBe(
		`Look at superset-sh/superset#8329 and Roadmap\nthen ${LATER}.`,
	);

	await hover("Roadmap");
	expect(asked).toEqual([{ url: NOTION, image: true }]);
});

test("right-clicking a link chip opens the link menu, not the pane's", async () => {
	const { view } = await renderText(`Look at ${PR} and ${DOCS}`, PREVIEW);
	for (const label of ["superset-sh/superset#8329", DOCS]) {
		fireEvent.contextMenu(view.getByText(label));
		expect(await screen.findByText("Copy Link")).toBeTruthy();
		expect(screen.queryByText("Close Pane")).toBeNull();
		fireEvent.keyDown(screen.getByText("Copy Link"), { key: "Escape" });
		await waitFor(() => expect(screen.queryByText("Copy Link")).toBeNull());
	}
});

test("a link chip opens like a link", async () => {
	const openLink = mock<OpenLink>(() => true);
	const { view } = await renderText(`Compare with ${DOCS}`, PREVIEW, openLink);
	// The test DOM follows an anchor while the click still bubbles, before
	// React's handler can cancel it, so the click is cancelled on the way down.
	view.container.addEventListener("click", (event) => event.preventDefault(), {
		capture: true,
	});
	fireEvent.click(view.getByText(DOCS));
	expect(openLink.mock.calls.map(([href]) => href)).toEqual([DOCS]);
});

test("copying a sent message gives back what was typed, not the labels shown", async () => {
	const text = `Look at ${PR} and ${DOCS}\nthen ${LATER}.`;
	const { view } = await renderText(text, PREVIEW);
	const message = view.getByTestId("messages").firstElementChild as HTMLElement;
	const copy = (target: Element) => {
		const setData = mock((_type: string, _text: string) => {});
		fireEvent.copy(target, { clipboardData: { setData } });
		return setData.mock.calls;
	};

	window.getSelection()?.selectAllChildren(message);
	expect(copy(message)).toEqual([["text/plain", text]]);

	const pill = view.getByText("superset-sh/superset#8329");
	window.getSelection()?.selectAllChildren(pill);
	expect(copy(pill)).toEqual([["text/plain", PR]]);

	window.getSelection()?.removeAllRanges();
	expect(copy(message)).toEqual([]);
});

test("copying across messages restores URLs and keeps the message boundary", async () => {
	const messages = [`See ${DOCS}`, `Then ${PR}`];
	const { view } = await renderText(messages, PREVIEW);
	const transcript = view.getByTestId("messages");
	window.getSelection()?.selectAllChildren(transcript);
	const setData = mock((_type: string, _text: string) => {});
	fireEvent.copy(transcript, { clipboardData: { setData } });
	expect(setData.mock.calls).toEqual([["text/plain", messages.join("\n")]]);
});

test("copying part of a plain URL keeps the selected substring", async () => {
	const { view } = await renderText(`${DOCS} then ${LATER}`, PREVIEW);
	const link = view.getByText(LATER);
	const range = document.createRange();
	range.setStart(link.firstChild as Text, 8);
	range.setEnd(link.firstChild as Text, 15);
	const selection = window.getSelection();
	selection?.removeAllRanges();
	selection?.addRange(range);
	const setData = mock((_type: string, _text: string) => {});
	fireEvent.copy(link, { clipboardData: { setData } });
	expect(selection?.toString()).toBe("example");
	expect(setData).not.toHaveBeenCalled();

	const title = view.getByText(DOCS);
	range.setStart(title.firstChild as Text, 0);
	selection?.removeAllRanges();
	selection?.addRange(range);
	fireEvent.copy(link, { clipboardData: { setData } });
	expect(selection?.toString()).toBe(`${DOCS} then https://example`);
	expect(setData).not.toHaveBeenCalled();
});

test("a pull request picked in the composer is drawn as the composer drew it", () => {
	const pr = {
		prNumber: 8329,
		title: "Load whole sessions",
		url: PR,
		state: "merged",
	};
	const chip = linkedPrChip(pr);
	const text = `Review ${PR}`;
	const elements = elementsForChips(text, [chip]);
	const sent = splitByElements(text, elements);
	const older = splitByElements(
		text,
		elements.map(({ data: _data, ...element }) => element),
	);
	const link: TRPCLink<AppRouter> = () => () => observable(() => {});
	const view = render(
		<workspaceTrpc.Provider
			client={workspaceTrpc.createClient({ links: [link] })}
			queryClient={new QueryClient()}
		>
			<ChatPaneActionsProvider openLink={() => true} workspaceId="workspace-1">
				<div data-testid="sent">
					<UserMessageText segments={sent} />
				</div>
				<div data-testid="older">
					<UserMessageText segments={older} />
				</div>
			</ChatPaneActionsProvider>
		</workspaceTrpc.Provider>,
	);
	const shown = view.getByTestId("sent").querySelector(".prompt-input-chip");
	expect(shown?.textContent).toBe(chip.label);
	expect(shown?.querySelector("img")?.getAttribute("src")).toBe(
		linkedPrIconUrl(pr),
	);
	const plain = view.getByTestId("older").querySelector(".prompt-input-chip");
	expect(plain?.textContent).toBe(chip.label);
	expect(plain?.querySelector("img")).toBeNull();
});
