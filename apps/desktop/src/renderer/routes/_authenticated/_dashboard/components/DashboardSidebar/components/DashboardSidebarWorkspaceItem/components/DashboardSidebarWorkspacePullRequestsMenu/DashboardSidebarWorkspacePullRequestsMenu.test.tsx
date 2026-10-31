import { afterEach, expect, test } from "bun:test";
import {
	createMemoryHistory,
	createRootRoute,
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
import {
	DashboardSidebarHoverProvider,
	useDashboardSidebarHover,
} from "../../../../providers/DashboardSidebarHoverProvider";
import type { DashboardSidebarWorkspace } from "../../../../types";
import { DashboardSidebarWorkspacePullRequestsMenu } from "./DashboardSidebarWorkspacePullRequestsMenu";

(
	globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;
afterEach(cleanup);

test("a PR menu suppresses a pending workspace hover and releases it on close", async () => {
	let pendingOpen: (() => void) | undefined;
	const originalSetTimeout = globalThis.setTimeout;
	globalThis.setTimeout = ((
		...[callback, delay, ...args]: Parameters<typeof setTimeout>
	) => {
		if (delay === 400) {
			pendingOpen = () => callback(...args);
			return originalSetTimeout(() => {}, 0);
		}
		return originalSetTimeout(callback, delay, ...args);
	}) as typeof setTimeout;
	const hover: { current: ReturnType<typeof useDashboardSidebarHover> | null } =
		{ current: null };
	function Row() {
		hover.current = useDashboardSidebarHover();
		return (
			<div
				data-testid="row"
				role="treeitem"
				tabIndex={0}
				onMouseEnter={(event) =>
					hover.current?.requestOpen("ws", event.currentTarget, {
						workspace: { id: "ws" } as DashboardSidebarWorkspace,
					})
				}
			>
				<DashboardSidebarWorkspacePullRequestsMenu
					workspaceId="ws"
					currentUrl="https://github.com/acme/app/pull/1"
					pullRequests={[1, 2].map((number) => ({
						number,
						title: `PR ${number}`,
						state: "open",
						url: `https://github.com/acme/app/pull/${number}`,
					}))}
				/>
			</div>
		);
	}
	const root = createRootRoute({
		component: () => (
			<DashboardSidebarHoverProvider>
				<Row />
			</DashboardSidebarHoverProvider>
		),
	});
	const router = createRouter({
		routeTree: root,
		history: createMemoryHistory({ initialEntries: ["/"] }),
	});
	try {
		render(<RouterProvider router={router} />);
		await act(async () => {
			await router.load();
		});
		fireEvent.mouseEnter(within(document.body).getByTestId("row"));
		expect(pendingOpen).toBeDefined();
		fireEvent.keyDown(
			within(document.body).getByRole("button", {
				name: "Open pull requests (2)",
			}),
			{ key: "Enter" },
		);
		const menu = await within(document.body).findByRole("menu");
		act(() => pendingOpen?.());
		expect(hover.current?.hoverCardSuppressed).toBe(true);
		expect(hover.current?.hoveredId).toBeNull();
		fireEvent.keyDown(menu, { key: "Escape" });
		await waitFor(() => expect(hover.current?.hoverCardSuppressed).toBe(false));
	} finally {
		globalThis.setTimeout = originalSetTimeout;
	}
});
