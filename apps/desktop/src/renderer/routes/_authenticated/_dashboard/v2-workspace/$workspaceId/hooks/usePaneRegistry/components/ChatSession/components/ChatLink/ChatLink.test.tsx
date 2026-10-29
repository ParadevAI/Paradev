import { afterEach, expect, test } from "bun:test";
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
	cleanup,
	fireEvent,
	render,
	screen,
	waitFor,
} from "@testing-library/react";
import type { TRPCLink } from "@trpc/client";
import { observable } from "@trpc/server/observable";
import type { ReactNode } from "react";
import { ChatPaneActionsProvider } from "../../providers/ChatPaneActionsProvider";
import { ChatLink } from "./ChatLink";

afterEach(cleanup);

const DOCS = "https://agentclientprotocol.com/protocol/content";
const PR = "https://github.com/superset-sh/superset/pull/8329";

function renderLink(href: string, children: ReactNode, answer: unknown) {
	const asked: { path: string; input: unknown }[] = [];
	const link: TRPCLink<AppRouter> = () => (call) =>
		observable((observer) => {
			asked.push({ path: call.op.path, input: call.op.input });
			observer.next({ result: { data: answer } });
			observer.complete();
		});
	const view = render(
		<workspaceTrpc.Provider
			client={workspaceTrpc.createClient({ links: [link] })}
			queryClient={new QueryClient()}
		>
			<ChatPaneActionsProvider openLink={() => true} workspaceId="workspace-1">
				<ContextMenu>
					<ContextMenuTrigger asChild>
						<div>
							<ChatLink href={href}>{children}</ChatLink>
						</div>
					</ContextMenuTrigger>
					<ContextMenuContent>
						<ContextMenuItem>Close Pane</ContextMenuItem>
					</ContextMenuContent>
				</ContextMenu>
			</ChatPaneActionsProvider>
		</workspaceTrpc.Provider>,
	);
	return { asked, link: view.getByRole("link") };
}

test("a web link asks for its preview with the image when focus arrives", async () => {
	const { asked, link } = renderLink(DOCS, "the content docs", {
		title: "Content · Agent Client Protocol",
		description: "How agents send content blocks.",
		iconDataUrl: null,
		image: null,
	});
	expect(link.title).toBe("");
	expect(asked).toEqual([]);

	link.focus();
	await screen.findByText("How agents send content blocks.");
	expect(asked).toEqual([
		{ path: "linkPreview.get", input: { url: DOCS, image: true } },
	]);
	expect(screen.getByText("agentclientprotocol.com")).toBeTruthy();
});

test("a card from a host without description or image still shows the title", async () => {
	const { link } = renderLink(DOCS, "docs", {
		title: "Content · Agent Client Protocol",
		iconDataUrl: null,
	});
	link.focus();
	expect(
		await screen.findByText("Content · Agent Client Protocol"),
	).toBeTruthy();
});

test("a pull request link gets the GitHub card, with a link to open it", async () => {
	const { asked, link } = renderLink(PR, PR, {
		kind: "pr",
		repo: "superset-sh/superset",
		number: 8329,
		url: PR,
		title: "feat(chat): load whole sessions",
		state: "open",
		draft: false,
		stateReason: null,
		summary: "",
		author: null,
		baseRefName: null,
		headRefName: null,
		labels: [],
		assignees: [],
		updatedAt: new Date().toISOString(),
	});
	expect(link.textContent).toBe("superset-sh/superset#8329");
	link.focus();
	await screen.findByText("feat(chat): load whole sessions");
	expect(asked.map(({ path }) => path)).toEqual(["github.getWorkItem"]);
	expect(
		screen.getByText("Open on GitHub").closest("a")?.getAttribute("href"),
	).toBe(PR);
});

test("a link with a service icon gets the website card too", async () => {
	const issue = "https://linear.app/acme/issue/ABC-12";
	const { asked, link } = renderLink(issue, issue, {
		title: "ABC-12 Fix login",
		description: null,
		iconDataUrl: null,
		image: null,
	});
	link.focus();
	await screen.findByText("ABC-12 Fix login");
	expect(asked).toEqual([
		{ path: "linkPreview.get", input: { url: issue, image: true } },
	]);
});

test("a link that is not on the web gets no card", () => {
	const { asked, link } = renderLink("mailto:ada@example.com", "Ada", null);
	link.focus();
	expect(link.title).toBe("mailto:ada@example.com");
	expect(asked).toEqual([]);
});

test("the pointer arriving starts the preview before the card opens", async () => {
	const { asked, link } = renderLink(DOCS, "docs", {
		title: "Docs",
		description: null,
		iconDataUrl: null,
		image: null,
	});
	fireEvent.pointerEnter(link, { pointerType: "mouse" });
	await waitFor(() =>
		expect(asked).toEqual([
			{ path: "linkPreview.get", input: { url: DOCS, image: true } },
		]),
	);
	expect(screen.queryByText("Docs")).toBeNull();
});

test("a square preview image is a thumbnail beside the text", async () => {
	const { link } = renderLink(DOCS, "docs", {
		title: "Square page",
		description: null,
		iconDataUrl: null,
		image: { dataUrl: "data:image/png;base64,AAAA", width: 200, height: 200 },
	});
	link.focus();
	const title = await screen.findByText("Square page");
	const card = title.closest("div.flex") as HTMLElement;
	expect(card.querySelector("img.size-16")).toBeTruthy();
});

test("right-clicking a link opens its own menu, not the pane's, and copies it", async () => {
	const writes: string[] = [];
	const original = Object.getOwnPropertyDescriptor(navigator, "clipboard");
	Object.defineProperty(navigator, "clipboard", {
		configurable: true,
		value: { writeText: async (text: string) => void writes.push(text) },
	});
	try {
		const { link } = renderLink(PR, PR, null);
		fireEvent.contextMenu(link);
		const copy = await screen.findByText("Copy Link");
		expect(screen.queryByText("Close Pane")).toBeNull();
		fireEvent.click(copy);
		await waitFor(() => expect(writes).toEqual([PR]));
	} finally {
		if (original) Object.defineProperty(navigator, "clipboard", original);
		else Reflect.deleteProperty(navigator, "clipboard");
	}
});
