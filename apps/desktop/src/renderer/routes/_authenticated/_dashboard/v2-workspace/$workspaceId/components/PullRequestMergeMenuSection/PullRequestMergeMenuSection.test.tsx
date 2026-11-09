import { afterEach, expect, mock, test } from "bun:test";
import { DropdownMenu, DropdownMenuContent } from "@superset/ui/dropdown-menu";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { PullRequestMergeFlow } from "renderer/routes/_authenticated/_dashboard/pull-requests/hooks/usePullRequestMergeFlow";
import { PullRequestMergeMenuSection } from "./PullRequestMergeMenuSection";

(
	globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

afterEach(cleanup);

function flowOf(
	overrides: Partial<PullRequestMergeFlow>,
): PullRequestMergeFlow {
	return {
		stackQuery: {
			stack: null,
			isLoading: false,
			isIncomplete: false,
			refetch: mock(),
		},
		stack: null,
		assessment: null,
		isStack: false,
		kind: { stack: false, queue: false },
		usesQueue: false,
		queued: null,
		count: null,
		blocker: null,
		handlesMerge: false,
		chain: [],
		isMerging: false,
		isDequeuing: false,
		isCreatingStack: false,
		confirm: null,
		request: mock(),
		cancel: mock(),
		run: mock(),
		dequeue: mock(),
		createStack: mock(),
		...overrides,
	};
}

function renderSection(flow: PullRequestMergeFlow, isQueued = false) {
	const onMergeAlone = mock(() => {});
	render(
		<QueryClientProvider client={new QueryClient()}>
			<DropdownMenu open>
				<DropdownMenuContent>
					<PullRequestMergeMenuSection
						target={null}
						flow={flow}
						isQueued={isQueued}
						isMergingAlone={false}
						onMergeAlone={onMergeAlone}
					/>
				</DropdownMenuContent>
			</DropdownMenu>
		</QueryClientProvider>,
	);
	return { onMergeAlone, items: screen.getAllByRole("menuitem") };
}

test("a lone pull request merges through the caller", () => {
	const flow = flowOf({});
	const { items, onMergeAlone } = renderSection(flow);
	fireEvent.click(items[0] as HTMLElement);
	expect(onMergeAlone).toHaveBeenCalledWith("squash");
	expect(flow.request).not.toHaveBeenCalled();
});

test("a stack asks the flow to confirm and shows how many it lands", () => {
	const flow = flowOf({
		isStack: true,
		kind: { stack: true, queue: false },
		handlesMerge: true,
		count: 3,
	});
	const { items, onMergeAlone } = renderSection(flow);
	expect(screen.getByText("Merge stack").parentElement?.textContent).toBe(
		"Merge stack3",
	);
	fireEvent.click(items[1] as HTMLElement);
	expect(flow.request).toHaveBeenCalledWith("merge");
	expect(onMergeAlone).not.toHaveBeenCalled();
});

test("a merge queue replaces the merge methods with one way in", () => {
	const flow = flowOf({ usesQueue: true, handlesMerge: true });
	const { items } = renderSection(flow);
	expect(items.map((item) => item.textContent)).toEqual(["Add to merge queue"]);
	fireEvent.click(items[0] as HTMLElement);
	expect(flow.request).toHaveBeenCalledTimes(1);
});

test("a queued pull request offers only the way out", () => {
	const flow = flowOf({ usesQueue: true, handlesMerge: true });
	const { items } = renderSection(flow, true);
	expect(items.map((item) => item.textContent)).toEqual(["Remove from queue"]);
	fireEvent.click(items[0] as HTMLElement);
	expect(flow.dequeue).toHaveBeenCalledTimes(1);
});
