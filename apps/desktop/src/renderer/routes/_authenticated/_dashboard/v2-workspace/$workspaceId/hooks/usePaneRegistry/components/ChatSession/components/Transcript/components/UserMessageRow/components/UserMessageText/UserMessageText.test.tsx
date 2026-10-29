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
import {
	linkedPrChip,
	linkedPrIconUrl,
} from "renderer/routes/_authenticated/components/AgentComposer/utils/linkedContextChips";
import {
	ChatPaneActionsProvider,
	type OpenLink,
} from "../../../../../../providers/ChatPaneActionsProvider";
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

async function renderText(
	text: string | string[],
	preview: { title: string | null; iconDataUrl: string | null },
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

test("a service link is a pill, the first other link its host and then its title on hover, the rest plain", async () => {
	const { asked, view, hover } = await renderText(
		`Look at ${PR} and ${DOCS}\nthen ${LATER}.`,
		{ title: "Content · Agent Client Protocol", iconDataUrl: null },
	);
	await act(async () => {});
	expect(view.getByText("agentclientprotocol.com").closest("a")?.href).toBe(
		DOCS,
	);
	expect(asked).toEqual([]);

	await hover("agentclientprotocol.com");
	expect(asked).toEqual([{ url: DOCS, image: true }]);
	const title = view.getAllByText("Content · Agent Client Protocol")[0];
	expect(title?.closest("a")?.href).toBe(DOCS);
	expect(view.getByText("superset-sh/superset#8329").closest("a")?.href).toBe(
		PR,
	);
	expect(view.getByText(LATER).className).toContain("text-link");
	expect(view.container.textContent).toBe(
		"Look at superset-sh/superset#8329 and aContent · Agent Client Protocol\nthen https://example.com/later.",
	);
});

test("right-clicking a link chip opens the link menu, not the pane's", async () => {
	const { view } = await renderText(`Look at ${PR} and ${DOCS}`, {
		title: "Content",
		iconDataUrl: null,
	});
	for (const label of [
		"superset-sh/superset#8329",
		"agentclientprotocol.com",
	]) {
		fireEvent.contextMenu(view.getByText(label));
		expect(await screen.findByText("Copy Link")).toBeTruthy();
		expect(screen.queryByText("Close Pane")).toBeNull();
		fireEvent.keyDown(screen.getByText("Copy Link"), { key: "Escape" });
		await waitFor(() => expect(screen.queryByText("Copy Link")).toBeNull());
	}
});

test("the chip shows the bare host when no title comes back, and opens like a link", async () => {
	const openLink = mock<OpenLink>(() => true);
	const { view, hover } = await renderText(
		`Compare with ${DOCS}`,
		{ title: null, iconDataUrl: null },
		openLink,
	);
	await hover("agentclientprotocol.com");
	const host = view.getByText("agentclientprotocol.com");
	expect(host.previousElementSibling?.textContent).toBe("a");

	// The test DOM follows an anchor while the click still bubbles, before
	// React's handler can cancel it, so the click is cancelled on the way down.
	view.container.addEventListener("click", (event) => event.preventDefault(), {
		capture: true,
	});
	fireEvent.click(host);
	expect(openLink.mock.calls.map(([href]) => href)).toEqual([DOCS]);
});

test("the site's icon replaces the letter when the host returns one", async () => {
	const icon = "data:image/png;base64,iVBORw0KGgo=";
	const { view, hover } = await renderText(DOCS, {
		title: "Content",
		iconDataUrl: icon,
	});
	await hover("agentclientprotocol.com");
	const box = view.getAllByText("Content")[0]?.previousElementSibling;
	expect(box?.querySelector("img")?.getAttribute("src")).toBe(icon);
});

test("copying a sent message gives back what was typed, not the labels shown", async () => {
	const text = `Look at ${PR} and ${DOCS}\nthen ${LATER}.`;
	const { view } = await renderText(text, {
		title: "Content · Agent Client Protocol",
		iconDataUrl: null,
	});
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
	const { view } = await renderText(messages, {
		title: "Documentation",
		iconDataUrl: null,
	});
	const transcript = view.getByTestId("messages");
	window.getSelection()?.selectAllChildren(transcript);
	const setData = mock((_type: string, _text: string) => {});
	fireEvent.copy(transcript, { clipboardData: { setData } });
	expect(setData.mock.calls).toEqual([["text/plain", messages.join("\n")]]);
});

test("copying part of a plain URL keeps the selected substring", async () => {
	const { view } = await renderText(`${DOCS} then ${LATER}`, {
		title: "Documentation",
		iconDataUrl: null,
	});
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

	const title = view.getByText("agentclientprotocol.com");
	range.setStart(title.firstChild as Text, 0);
	selection?.removeAllRanges();
	selection?.addRange(range);
	fireEvent.copy(link, { clipboardData: { setData } });
	expect(setData.mock.calls).toEqual([
		["text/plain", `${DOCS} then https://example`],
	]);
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
	// A message sent before chips kept their data.
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
