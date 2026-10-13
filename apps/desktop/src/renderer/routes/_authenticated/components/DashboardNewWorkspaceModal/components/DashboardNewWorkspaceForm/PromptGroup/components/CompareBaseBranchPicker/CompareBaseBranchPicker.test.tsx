import { afterEach, describe, expect, mock, test } from "bun:test";

(
	globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

const { act, cleanup, fireEvent, render, within } = await import(
	"@testing-library/react"
);
const { CompareBaseBranchPicker } = await import("./CompareBaseBranchPicker");
afterEach(cleanup);

function renderPicker(
	overrides: Partial<React.ComponentProps<typeof CompareBaseBranchPicker>>,
) {
	render(
		<CompareBaseBranchPicker
			effectiveCompareBaseBranch={null}
			defaultBranch={null}
			isBranchesLoading={false}
			isBranchesError={false}
			branchesError={null}
			isBranchesRefetching={false}
			onRetryBranches={() => {}}
			isHostOffline={false}
			branches={[]}
			branchSearch=""
			onBranchSearchChange={() => {}}
			branchFilter="all"
			onBranchFilterChange={() => {}}
			isFetchingNextPage={false}
			hasNextPage={false}
			onLoadMore={() => {}}
			onSelectCompareBaseBranch={() => {}}
			onOpenWorkspace={() => {}}
			{...overrides}
		/>,
	);
	return within(document.body);
}

describe("CompareBaseBranchPicker load failures", () => {
	test("says the host is offline instead of reporting a failed load", () => {
		const page = renderPicker({ isHostOffline: true, isBranchesError: true });
		expect(page.getByText("Host is offline")).toBeTruthy();
		expect(page.queryByText("Failed to load branches")).toBeNull();
	});

	test("shows the host's reason and retries on demand", () => {
		const onRetryBranches = mock(() => {});
		const page = renderPicker({
			isBranchesError: true,
			branchesError: new Error(
				"Project directory is no longer a directory on disk",
			),
			onRetryBranches,
		});
		expect(
			page.getByText("Failed to load branches").getAttribute("title"),
		).toBe("Project directory is no longer a directory on disk");
		fireEvent.click(page.getByRole("button", { name: "Retry" }));
		expect(onRetryBranches).toHaveBeenCalledTimes(1);
	});

	test("keeps loaded branches usable when a later fetch fails", async () => {
		const page = renderPicker({
			effectiveCompareBaseBranch: "main",
			isBranchesError: true,
			branches: [
				{
					name: "main",
					lastCommitDate: 0,
					isLocal: true,
					isRemote: false,
					recency: null,
					worktreePath: null,
					hasWorkspace: false,
					isCheckedOut: false,
				},
			],
		});
		await act(async () => {
			fireEvent.click(page.getByRole("button", { name: "main" }));
		});
		expect(page.getByRole("option", { name: /main/ })).toBeTruthy();
		expect(page.getByText("Failed to load branches")).toBeTruthy();
	});

	test("keeps the list open when a search fails while it is open", async () => {
		const main = {
			name: "main",
			lastCommitDate: 0,
			isLocal: true,
			isRemote: false,
			recency: null,
			worktreePath: null,
			hasWorkspace: false,
			isCheckedOut: false,
		};
		const props = (
			overrides: Partial<React.ComponentProps<typeof CompareBaseBranchPicker>>,
		) => (
			<CompareBaseBranchPicker
				effectiveCompareBaseBranch="main"
				defaultBranch="main"
				isBranchesLoading={false}
				isBranchesError={false}
				branchesError={null}
				isBranchesRefetching={false}
				onRetryBranches={() => {}}
				isHostOffline={false}
				branches={[main]}
				branchSearch=""
				onBranchSearchChange={() => {}}
				branchFilter="all"
				onBranchFilterChange={() => {}}
				isFetchingNextPage={false}
				hasNextPage={false}
				onLoadMore={() => {}}
				onSelectCompareBaseBranch={() => {}}
				onOpenWorkspace={() => {}}
				{...overrides}
			/>
		);
		const { rerender } = render(props({}));
		const page = within(document.body);
		await act(async () => {
			fireEvent.click(page.getByRole("button", { name: "main" }));
		});
		await act(async () => {
			rerender(
				props({ branches: [], branchSearch: "fix", isBranchesError: true }),
			);
		});
		expect(page.getByRole("combobox")).toBeTruthy();
		expect(page.getByText("Failed to load branches")).toBeTruthy();
		expect(page.queryByText("No branches found")).toBeNull();
	});

	test("disables Retry while the retry is running", () => {
		const page = renderPicker({
			isBranchesError: true,
			isBranchesRefetching: true,
		});
		const retry = page.getByRole("button", { name: "Retrying…" });
		expect((retry as HTMLButtonElement).disabled).toBe(true);
	});
});
