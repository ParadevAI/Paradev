import { supersetTestKit } from "../../../supersetTestKit";

const kit = await supersetTestKit();
const { afterEach, describe, expect, mock, test } = await import("bun:test");
const { QueryClient, QueryClientProvider } = await import(
	"@tanstack/react-query"
);
const fx = await import("../../../supersetFixtures");
const { useWorkspaceAgentsRowStore } = await import(
	"renderer/stores/workspace-agents-row"
);
const { toSidebarWorkspace } = await import("../../utils/toSidebarWorkspace");
const { LocalWorkspaceRow } = await import("./LocalWorkspaceRow");

const workspace = toSidebarWorkspace(fx.localWorkspace, fx.LOCAL_HOST_ID);
const binding = (terminalId: string, agentId: string) => ({
	terminalId,
	agentId,
	startedAt: Date.now() - 60_000,
	lastEventType: null,
	lastEventAt: null,
	subagents: [],
});

afterEach(() => useWorkspaceAgentsRowStore.setState({ enabled: false }));

function mount(bindings: ReturnType<typeof binding>[] = []) {
	const client = new QueryClient();
	client.setQueryData(["terminal-agent-bindings", workspace.id], bindings);
	const onOpen = mock();
	const view = kit.render(
		<kit.TooltipProvider>
			<QueryClientProvider client={client}>
				<LocalWorkspaceRow
					workspace={workspace}
					diffStats={{ additions: 184, deletions: 37 }}
					onOpen={onOpen}
				/>
			</QueryClientProvider>
		</kit.TooltipProvider>,
	);
	return { ...view, onOpen };
}

describe("LocalWorkspaceRow", () => {
	test("the row opens the workspace", async () => {
		const row = mount();
		await kit.act(async () => {
			kit.fireEvent.click(row.getByTitle(fx.localWorkspace.name));
		});
		expect(row.onOpen).toHaveBeenCalledTimes(1);
	});

	test("with the agents row on and two agents running, the row still draws outside the sidebar", () => {
		useWorkspaceAgentsRowStore.setState({ enabled: true });
		const row = mount([binding("t1", "claude"), binding("t2", "codex")]);
		expect(row.getByTitle(fx.localWorkspace.name)).toBeTruthy();
		expect(row.getByRole("button", { name: /^2 running agents/ })).toBeTruthy();
	});
});
