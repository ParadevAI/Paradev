import { afterEach, expect, test } from "bun:test";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
	cleanup,
	fireEvent,
	render,
	screen,
	waitFor,
} from "@testing-library/react";
import { env } from "renderer/env.renderer";
import { DashboardSidebarHoverProvider } from "../../../../providers/DashboardSidebarHoverProvider";
import { DashboardSidebarWorkspaceContextMenu } from "./DashboardSidebarWorkspaceContextMenu";

afterEach(cleanup);

const WORKSPACE_ID = "b502bf30-8693-4815-be65-795035e0ce5f";
const noop = () => {};

const KINDS = [
	{ kind: "local", isLocalWorkspace: true, isCloudWorkspace: false },
	{ kind: "remote", isLocalWorkspace: false, isCloudWorkspace: false },
	{ kind: "cloud", isLocalWorkspace: false, isCloudWorkspace: true },
];

for (const { kind, isLocalWorkspace, isCloudWorkspace } of KINDS) {
	test(`Copy link on a ${kind} workspace copies its web share link`, async () => {
		const writes: string[] = [];
		const original = Object.getOwnPropertyDescriptor(navigator, "clipboard");
		Object.defineProperty(navigator, "clipboard", {
			configurable: true,
			value: { writeText: async (text: string) => void writes.push(text) },
		});
		try {
			render(
				<QueryClientProvider client={new QueryClient()}>
					<DashboardSidebarHoverProvider>
						<DashboardSidebarWorkspaceContextMenu
							workspaceId={WORKSPACE_ID}
							projectId="project-1"
							isLocalWorkspace={isLocalWorkspace}
							isCloudWorkspace={isCloudWorkspace}
							isPinned={false}
							isUnread={false}
							hasStatus={false}
							hasPullRequest={false}
							onTogglePin={noop}
							onCreateSection={noop}
							onMoveToSection={noop}
							onOpenInFinder={noop}
							onCopyPath={noop}
							onCopyBranchName={noop}
							onCopyWorkspaceId={noop}
							onToggleUnread={noop}
							onClearStatus={noop}
							onRemovePullRequest={noop}
						>
							<span>workspace row</span>
						</DashboardSidebarWorkspaceContextMenu>
					</DashboardSidebarHoverProvider>
				</QueryClientProvider>,
			);
			fireEvent.contextMenu(screen.getByText("workspace row"));
			fireEvent.keyDown(await screen.findByText("Copy"), { key: "ArrowRight" });
			fireEvent.click(await screen.findByText("Copy link"));
			await waitFor(() =>
				expect(writes).toEqual([
					`${env.NEXT_PUBLIC_WEB_URL}/workspaces/${WORKSPACE_ID}`,
				]),
			);
		} finally {
			if (original) Object.defineProperty(navigator, "clipboard", original);
			else Reflect.deleteProperty(navigator, "clipboard");
		}
	});
}
