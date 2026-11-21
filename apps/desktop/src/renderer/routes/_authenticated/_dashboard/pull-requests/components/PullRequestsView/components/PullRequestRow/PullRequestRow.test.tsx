import { afterEach, describe, expect, test } from "bun:test";
import { PullRequestRow, type PullRequestRowData } from "./PullRequestRow";

const { cleanup, render } = await import("@testing-library/react");
afterEach(cleanup);

const pendingRow: PullRequestRowData = {
	projectId: "p1",
	prNumber: 7,
	title: "Widgets",
	state: "open",
	isDraft: false,
	authorLogin: null,
	updatedAt: null,
	additions: null,
	deletions: null,
	headRefName: null,
	checks: [],
	detailsPending: true,
};

describe("PullRequestRow pending details", () => {
	test("shows placeholders only while a request will fill them, never a false 'No checks'", () => {
		const loading = render(
			<PullRequestRow
				pr={pendingRow}
				repoSlug={undefined}
				isSelected={false}
				detailsLoading
				onClick={() => {}}
			/>,
		);
		expect(loading.container.querySelectorAll(".pr-skeleton").length).toBe(3);
		loading.unmount();

		const stale = render(
			<PullRequestRow
				pr={pendingRow}
				repoSlug={undefined}
				isSelected={false}
				detailsLoading={false}
				onClick={() => {}}
			/>,
		);
		expect(stale.container.querySelectorAll(".pr-skeleton").length).toBe(0);
		expect(stale.container.querySelector("output")).toBeNull();
	});

	test("carried checks show while a refresh loads and are hidden if nothing confirms them", () => {
		const carriedRow: PullRequestRowData = {
			...pendingRow,
			checks: [{ name: "CI", status: "success", url: null }],
			detailsCarried: true,
		};
		const refreshing = render(
			<PullRequestRow
				pr={carriedRow}
				repoSlug={undefined}
				isSelected={false}
				detailsLoading
				onClick={() => {}}
			/>,
		);
		expect(refreshing.container.querySelectorAll(".pr-skeleton").length).toBe(
			0,
		);
		expect(refreshing.container.querySelector("output")).not.toBeNull();
		refreshing.unmount();

		const unconfirmed = render(
			<PullRequestRow
				pr={carriedRow}
				repoSlug={undefined}
				isSelected={false}
				detailsLoading={false}
				onClick={() => {}}
			/>,
		);
		expect(unconfirmed.container.querySelector("output")).toBeNull();
	});
});
