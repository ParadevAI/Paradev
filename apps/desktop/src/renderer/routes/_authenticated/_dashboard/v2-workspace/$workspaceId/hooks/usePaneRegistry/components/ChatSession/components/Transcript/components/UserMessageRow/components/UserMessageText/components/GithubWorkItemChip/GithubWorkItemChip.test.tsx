import { afterEach, expect, mock, test } from "bun:test";
import type { AppRouter } from "@superset/host-service/trpc";
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
import { TRPCClientError } from "@trpc/client";
import { observable } from "@trpc/server/observable";
import {
	ChatPaneActionsProvider,
	type OpenLink,
} from "../../../../../../../../providers/ChatPaneActionsProvider";
import type { GithubWorkItemLink } from "../../../../../../../../utils/githubWorkItem";
import { GithubWorkItemChip } from "./GithubWorkItemChip";

afterEach(cleanup);

const URL_PR = "https://github.com/superset-sh/superset/pull/8329";
const ITEM = {
	kind: "pr",
	repo: "superset-sh/superset",
	number: 8329,
	url: URL_PR,
	title: "feat(chat): load whole sessions",
	state: "merged",
	draft: false,
	stateReason: null,
	summary: "Loads a session through an outline plus item bodies.",
	author: { login: "AviPeltz", avatarUrl: null },
	baseRefName: "main",
	headRefName: "feat/chat-whole-sessions",
	labels: [{ name: "desktop", color: "1d76db" }],
	assignees: [{ login: "AviPeltz", avatarUrl: null }],
	updatedAt: new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString(),
};

function renderChip(
	answer: () => unknown,
	link: GithubWorkItemLink = {
		kind: "pr",
		owner: "superset-sh",
		repo: "superset",
		number: 8329,
	},
	openLink: OpenLink = () => true,
	url = URL_PR,
) {
	const asked: unknown[] = [];
	const trpcLink: TRPCLink<AppRouter> = () => (call) =>
		observable((observer) => {
			asked.push(call.op.input);
			try {
				observer.next({ result: { data: answer() } });
				observer.complete();
			} catch (error) {
				observer.error(TRPCClientError.from(error as Error));
			}
		});
	const view = render(
		<workspaceTrpc.Provider
			client={workspaceTrpc.createClient({ links: [trpcLink] })}
			queryClient={new QueryClient()}
		>
			<ChatPaneActionsProvider openLink={openLink} workspaceId="workspace-1">
				<GithubWorkItemChip link={link} url={url} />
			</ChatPaneActionsProvider>
		</workspaceTrpc.Provider>,
	);
	return { asked, view, chip: view.getByRole("link") };
}

test("a pull request chip asks for details only when the pointer or focus arrives", async () => {
	const { asked, chip } = renderChip(() => ITEM);
	await act(async () => {});
	expect(chip.textContent).toBe("PR #8329");
	expect(chip.title).toBe(URL_PR);
	expect(chip.querySelector("span")?.className).toContain(
		"text-muted-foreground",
	);
	expect(asked).toEqual([]);

	chip.focus();
	await screen.findByText("feat(chat): load whole sessions");
	expect(asked).toEqual([
		{ owner: "superset-sh", repo: "superset", kind: "pr", number: 8329 },
	]);
	const card = screen
		.getByText("superset-sh/superset")
		.closest("div[class*=p-3]") as HTMLElement;
	expect(card.textContent).toContain("Merged");
	expect(card.textContent).toContain("main ← feat/chat-whole-sessions");
	expect(card.textContent).toContain("desktop");
	expect(card.textContent).toContain("AviPeltz");
	expect(card.textContent).toContain("Updated");
	expect(chip.querySelector("span")?.className).toContain("violet");
});

test("an open pull request chip turns green, not the merged purple", async () => {
	const { chip } = renderChip(() => ({ ...ITEM, state: "open" }));
	chip.focus();
	await screen.findByText("feat(chat): load whole sessions");
	const className = chip.querySelector("span")?.className;
	expect(className).toContain("emerald");
	expect(className).not.toContain("violet");
});

test("a chip with an unknown state stays neutral, and the link still opens", async () => {
	const openLink = mock<OpenLink>(() => true);
	const { chip } = renderChip(
		() => {
			throw new Error("Not Found");
		},
		{ kind: "issue", owner: "acme", repo: "widgets", number: 42 },
		openLink,
	);
	expect(chip.textContent).toBe("Issue #42");
	expect(chip.querySelector("span")?.className).toContain(
		"text-muted-foreground",
	);

	chip.focus();
	expect(
		await screen.findByText(
			"Details are not available here, but the link still opens.",
		),
	).toBeTruthy();

	expect(chip.querySelector("span")?.className).toContain(
		"text-muted-foreground",
	);

	fireEvent.click(chip);
	expect(openLink.mock.calls.map(([href]) => href)).toEqual([URL_PR]);
});

test("right-clicking closes the card, and copying the link leaves it closed", async () => {
	const original = Object.getOwnPropertyDescriptor(navigator, "clipboard");
	Object.defineProperty(navigator, "clipboard", {
		configurable: true,
		value: { writeText: async () => {} },
	});
	try {
		const { chip } = renderChip(() => ITEM);
		chip.focus();
		await screen.findByText("feat(chat): load whole sessions");

		fireEvent.contextMenu(chip);
		const copy = await screen.findByText("Copy Link");
		expect(screen.queryByText("feat(chat): load whole sessions")).toBeNull();

		fireEvent.click(copy);
		await waitFor(() => expect(screen.queryByText("Copy Link")).toBeNull());
		expect(document.activeElement).not.toBe(chip);
		expect(screen.queryByText("feat(chat): load whole sessions")).toBeNull();
	} finally {
		if (original) Object.defineProperty(navigator, "clipboard", original);
		else Reflect.deleteProperty(navigator, "clipboard");
	}
});

test("the card links to the pasted URL, and opening it closes the card", async () => {
	const files = `${URL_PR}/files`;
	const openLink = mock<OpenLink>(() => true);
	const { chip } = renderChip(() => ITEM, undefined, openLink, files);
	chip.focus();
	const title = await screen.findByText("feat(chat): load whole sessions");
	expect(title.closest("a")?.getAttribute("href")).toBe(files);

	fireEvent.click(screen.getByText("Open on GitHub"));
	expect(openLink.mock.calls.map(([href]) => href)).toEqual([files]);
	await waitFor(() =>
		expect(screen.queryByText("feat(chat): load whole sessions")).toBeNull(),
	);
});
