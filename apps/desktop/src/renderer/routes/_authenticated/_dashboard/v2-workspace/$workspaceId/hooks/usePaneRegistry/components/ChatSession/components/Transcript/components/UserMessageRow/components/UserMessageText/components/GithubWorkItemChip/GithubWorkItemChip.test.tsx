import { afterEach, expect, mock, test } from "bun:test";
import type { AppRouter } from "@superset/host-service/trpc";
import { workspaceTrpc } from "@superset/workspace-client";
import { QueryClient } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
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
				<GithubWorkItemChip link={link} url={URL_PR} />
			</ChatPaneActionsProvider>
		</workspaceTrpc.Provider>,
	);
	return { asked, view, chip: view.getByRole("link") };
}

test("a pull request chip asks for details only once the card opens", async () => {
	const { asked, chip } = renderChip(() => ITEM);
	expect(chip.textContent).toBe("PR #8329");
	expect(chip.title).toBe(URL_PR);
	expect(chip.querySelector("span")?.className).toContain("violet");
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
});

test("an issue chip is green, and a lookup that fails still leaves the link usable", async () => {
	const openLink = mock<OpenLink>(() => true);
	const { chip } = renderChip(
		() => {
			throw new Error("Not Found");
		},
		{ kind: "issue", owner: "acme", repo: "widgets", number: 42 },
		openLink,
	);
	expect(chip.textContent).toBe("Issue #42");
	expect(chip.querySelector("span")?.className).toContain("emerald");

	chip.focus();
	expect(
		await screen.findByText(
			"Details are not available here, but the link still opens.",
		),
	).toBeTruthy();

	fireEvent.click(chip);
	expect(openLink.mock.calls.map(([href]) => href)).toEqual([URL_PR]);
});
