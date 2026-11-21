import { afterEach, expect, mock, test } from "bun:test";
import { DropdownMenu, DropdownMenuContent } from "@superset/ui/dropdown-menu";
import {
	QueryClient,
	QueryClientProvider,
	useQuery,
} from "@tanstack/react-query";
import {
	act,
	cleanup,
	fireEvent,
	render,
	renderHook,
	screen,
} from "@testing-library/react";
import type { ReactNode } from "react";
import {
	type CachedPullRequestDetail,
	pullRequestDetailQueryOptions,
} from "renderer/routes/_authenticated/_dashboard/pull-requests/hooks/usePullRequestDetail";
import { toPullRequestDetail } from "renderer/routes/_authenticated/_dashboard/pull-requests/utils/toPullRequestDetail";
import { cloudPullRequestRead } from "renderer/routes/_authenticated/_dashboard/pull-requests/utils/toPullRequestDetail/fixtures";
import { MergeMethodMenuItems } from "./MergeMethodMenuItems";

(
	globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

afterEach(cleanup);

const target = {
	organizationId: "org-1",
	repoFullName: "owner/repo",
	prNumber: 7,
};

function clientWithDetailPersistedBeforeMergeMethods() {
	const { mergeMethods: _dropped, ...stale } = toPullRequestDetail(
		cloudPullRequestRead(),
		target.repoFullName,
	);
	const queryClient = new QueryClient();
	queryClient.setQueryData<CachedPullRequestDetail>(
		pullRequestDetailQueryOptions(target).queryKey,
		stale,
	);
	return queryClient;
}

test("a cached detail without merge methods offers every method and merges with squash", async () => {
	const queryClient = clientWithDetailPersistedBeforeMergeMethods();
	const wrapper = ({ children }: { children: ReactNode }) => (
		<QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
	);

	const { result } = renderHook(
		() => useQuery(pullRequestDetailQueryOptions(target)),
		{ wrapper },
	);
	expect(result.current.data?.mergeMethods).toEqual({
		methods: ["squash", "merge", "rebase"],
		primary: "squash",
	});

	const onMerge = mock(() => {});
	await act(async () => {
		render(
			<DropdownMenu open>
				<DropdownMenuContent>
					<MergeMethodMenuItems
						target={target}
						isMerging={false}
						onMerge={onMerge}
					/>
				</DropdownMenuContent>
			</DropdownMenu>,
			{ wrapper },
		);
	});
	const items = screen.getAllByRole("menuitem");
	expect(items.map((item) => item.textContent)).toEqual([
		"Squash and mergeDefault",
		"Merge commit",
		"Rebase and merge",
	]);
	fireEvent.click(items[0] as HTMLElement);
	expect(onMerge).toHaveBeenCalledWith("squash");
});
