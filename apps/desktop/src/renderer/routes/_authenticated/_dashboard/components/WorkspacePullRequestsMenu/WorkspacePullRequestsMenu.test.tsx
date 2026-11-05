import { afterEach, describe, expect, mock, test } from "bun:test";
import {
	createMemoryHistory,
	createRootRoute,
	createRoute,
	createRouter,
	RouterProvider,
} from "@tanstack/react-router";
import {
	act,
	cleanup,
	fireEvent,
	render,
	waitFor,
	within,
} from "@testing-library/react";
import type { WorkspacePullRequestSummary } from "renderer/lib/github/workspacePullRequests";
import { usePullRequestPaneIntent } from "renderer/stores/pull-request-pane-intent";
import { WorkspacePullRequestsMenu } from "./WorkspacePullRequestsMenu";

(
	globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;
const current: WorkspacePullRequestSummary = {
	number: 101,
	title: "Current branch",
	state: "open",
	url: "https://github.com/acme/app/pull/101",
};
const previous: WorkspacePullRequestSummary = {
	number: 101,
	title: "Earlier repository",
	state: "merged",
	url: "https://github.com/acme/other/pull/101",
};

afterEach(() => {
	cleanup();
	usePullRequestPaneIntent.setState({ intent: null });
	document.body.style.pointerEvents = "";
});

async function mount(
	pullRequests: WorkspacePullRequestSummary[],
	currentUrl: string | null = current.url,
) {
	const rowEvents = mock(() => {});
	const root = createRootRoute({
		component: () => (
			// biome-ignore lint/a11y/useSemanticElements: reproduces a workspace row containing independent controls
			<div
				role="button"
				tabIndex={0}
				onClick={rowEvents}
				onMouseDown={rowEvents}
				onKeyDown={rowEvents}
			>
				<WorkspacePullRequestsMenu
					workspaceId="ws"
					pullRequests={pullRequests}
					currentUrl={currentUrl}
				/>
			</div>
		),
	});
	const workspace = createRoute({
		getParentRoute: () => root,
		path: "/v2-workspace/$workspaceId",
	});
	const router = createRouter({
		routeTree: root.addChildren([workspace]),
		history: createMemoryHistory({ initialEntries: ["/"] }),
	});
	const view = render(<RouterProvider router={router} />);
	await act(async () => {
		await router.load();
	});
	return { router, rowEvents, ...view };
}

describe("WorkspacePullRequestsMenu", () => {
	test("preserves the single-current-PR interaction", async () => {
		await mount([current]);
		expect(
			within(document.body).queryByRole("button", {
				name: /Open pull requests/,
			}),
		).toBeNull();
	});
	test("opens by keyboard, shows every state/link, and restores focus on Escape", async () => {
		await mount([current, previous]);
		const trigger = within(document.body).getByRole("button", {
			name: "Open pull requests (2)",
		});
		trigger.focus();
		fireEvent.keyDown(trigger, { key: "Enter" });
		const menu = await within(document.body).findByRole("menu");
		const items = within(menu).getAllByRole("menuitem");
		expect(items.map((item) => item.getAttribute("href"))).toEqual([
			current.url,
			previous.url,
		]);
		expect(items[0]?.textContent).toContain("Open");
		expect(items[0]?.textContent).toContain("Current");
		expect(items[1]?.textContent).toContain("Merged");
		fireEvent.keyDown(menu, { key: "Escape" });
		await waitFor(() =>
			expect(within(document.body).queryByRole("menu")).toBeNull(),
		);
		await waitFor(() => expect(document.activeElement).toBe(trigger));
	});
	test("opens the selected PR's own repository inside the workspace", async () => {
		const { router, rowEvents } = await mount([current, previous]);
		fireEvent.keyDown(
			within(document.body).getByRole("button", { name: /Open pull requests/ }),
			{ key: "Enter" },
		);
		const menu = await within(document.body).findByRole("menu");
		const item = within(menu).getAllByRole("menuitem")[1];
		if (!item) throw new Error("missing historical PR");
		await act(async () => {
			fireEvent.click(item);
		});
		expect(rowEvents).not.toHaveBeenCalled();
		await waitFor(() =>
			expect(within(document.body).queryByRole("menu")).toBeNull(),
		);
		expect(usePullRequestPaneIntent.getState().intent).toEqual({
			workspaceId: "ws",
			repoFullName: "acme/other",
			number: 101,
			placement: "split",
		});
		await waitFor(() =>
			expect(router.state.location.pathname).toBe("/v2-workspace/ws"),
		);
	});
	test("keeps history accessible when there is no current pointer", async () => {
		await mount([previous], null);
		fireEvent.keyDown(
			within(document.body).getByRole("button", {
				name: "Open pull requests (1)",
			}),
			{ key: " " },
		);
		expect(await within(document.body).findByRole("menuitem")).toHaveProperty(
			"href",
			previous.url,
		);
	});
});
