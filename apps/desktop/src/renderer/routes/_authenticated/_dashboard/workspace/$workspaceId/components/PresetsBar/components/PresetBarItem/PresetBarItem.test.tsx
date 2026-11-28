import { afterEach, expect, mock, test } from "bun:test";
import { createWorkspaceStore } from "@superset/panes";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
	act,
	cleanup,
	fireEvent,
	render,
	screen,
	within,
} from "@testing-library/react";
import { DndProvider } from "react-dnd";
import { HTML5Backend } from "react-dnd-html5-backend";
import {
	HOST_USAGE_QUOTA_QUERY_KEY,
	type UsageAccount,
} from "renderer/hooks/host-service/useHostUsageQuota";
import type { TerminalPresetRow } from "renderer/routes/_authenticated/providers/CollectionsProvider/dashboardSidebarLocal";
import { launchPresetTab } from "../../../../hooks/usePresetExecution/utils/launchPresetTab";
import { runPresetOnce } from "../../../../state/presetLaunches";
import type { PaneViewerData } from "../../../../types";
import { PresetBarItem } from "./PresetBarItem";

afterEach(cleanup);

function showButton(
	name: string,
	execute: () => void,
	accounts: UsageAccount[] = [],
) {
	const workspaceId = "workspace";
	const hostUrl = "https://host.invalid";
	const client = new QueryClient();
	client.setQueryData([...HOST_USAGE_QUOTA_QUERY_KEY, hostUrl], accounts);
	const preset: TerminalPresetRow = {
		id: crypto.randomUUID(),
		name,
		agentId: name.toLowerCase(),
		commands: [name.toLowerCase()],
		cwd: "",
		projectIds: null,
		executionMode: "new-tab",
		tabOrder: 0,
		createdAt: new Date(),
	};
	const viewUsage = mock(() => {});
	render(
		<QueryClientProvider client={client}>
			<DndProvider backend={HTML5Backend}>
				<PresetBarItem
					workspaceId={workspaceId}
					hostUrl={hostUrl}
					preset={preset}
					visibleIndex={0}
					isDark={false}
					agents={[]}
					onExecutePreset={execute}
					onViewUsage={viewUsage}
					onEdit={() => {}}
					onLocalReorder={() => {}}
					onPersistReorder={() => {}}
				/>
			</DndProvider>
		</QueryClientProvider>,
	);
	return {
		button: screen.getByRole("button", { name: new RegExp(name) }),
		viewUsage,
		workspaceId,
		preset,
	};
}

test.each([
	"Pi",
	"Codex",
])("%s opens one tab while the host is starting", async (name) => {
	const store = createWorkspaceStore<PaneViewerData>();
	const preference = Promise.withResolvers<null>();
	const session = Promise.withResolvers<string>();
	const launcher = {
		mint: () => crypto.randomUUID(),
		create: mock(() => session.promise),
	};
	let pending: Promise<void> | undefined;
	const { button, workspaceId, preset } = showButton(name, () => {
		pending = runPresetOnce(workspaceId, preset.id, () =>
			launchPresetTab({
				store,
				linkedStores: [],
				launcher,
				title: name,
				command: name.toLowerCase(),
				tryChat: () => preference.promise,
			}),
		);
	});
	await act(async () => {
		fireEvent.click(button);
		fireEvent.click(button);
	});
	expect(button.getAttribute("aria-busy")).toBe("true");
	expect(store.getState().tabs).toHaveLength(1);
	expect(launcher.create).not.toHaveBeenCalled();
	await act(async () => {
		preference.resolve(null);
	});
	expect(launcher.create).toHaveBeenCalledTimes(1);
	fireEvent.click(button);
	expect(store.getState().tabs).toHaveLength(1);
	await act(async () => {
		session.resolve("ready");
		await pending;
	});
	expect(button.hasAttribute("disabled")).toBe(false);
	await act(async () => {
		fireEvent.click(button);
		await pending;
	});
	expect(store.getState().tabs).toHaveLength(2);
});

test("shows the default Codex account quota on the button and in its menu", async () => {
	const account: UsageAccount = {
		agent: "codex",
		credentialKind: "subscription",
		accountKey: "selected",
		sourceLabel: "default",
		email: null,
		plan: null,
		status: "ok",
		statusDetail: null,
		windows: [
			{ id: "secondary", label: "Weekly", usedPercent: 46, resetsAt: null },
		],
		creditsBalance: null,
		extraUsage: null,
		selection: null,
		isDefault: true,
		fetchedAt: new Date(),
	};
	const { button, viewUsage } = showButton("Codex", () => {}, [
		{
			...account,
			accountKey: "other",
			isDefault: false,
			windows: [{ ...account.windows[0], usedPercent: 90 }],
		},
		account,
	]);
	expect(button.textContent).toContain("46%");
	fireEvent.contextMenu(button);
	const menu = within(await screen.findByRole("menu"));
	expect(menu.getByText("Weekly")).toBeDefined();
	expect(menu.getByText("46%")).toBeDefined();
	expect(menu.queryByText("90%")).toBeNull();
	fireEvent.click(menu.getByText("View usage"));
	expect(viewUsage).toHaveBeenCalledTimes(1);
});

test("shows a link to usage when Codex quota data is unavailable", async () => {
	const { button } = showButton("Codex", () => {});
	fireEvent.contextMenu(button);
	const menu = within(await screen.findByRole("menu"));
	expect(menu.getByRole("status").textContent).toContain("Usage unavailable.");
	expect(menu.getByText("View usage")).toBeDefined();
	expect(button.textContent).not.toContain("%");
});
