import { describe, expect, test } from "bun:test";
import { cleanup, fireEvent, render } from "@testing-library/react";
import { RepositoryListStatus } from "./RepositoryListStatus";

describe("RepositoryListStatus", () => {
	test("shows the loading indicator while another page is pending", () => {
		const { getByText, queryByRole } = render(
			<RepositoryListStatus
				isLoading={false}
				isLoadingMore
				error={null}
				onRetry={() => {}}
			/>,
		);

		expect(getByText("Loading repositories...")).toBeTruthy();
		expect(queryByRole("button", { name: "Retry" })).toBeNull();
		cleanup();
	});

	test("shows the failure and retries it", () => {
		let retries = 0;
		const { getByText, getByRole } = render(
			<RepositoryListStatus
				isLoading={false}
				isLoadingMore={false}
				error={new Error("Listing GitHub repositories took longer than 20s.")}
				onRetry={() => {
					retries++;
				}}
			/>,
		);

		expect(
			getByText("Listing GitHub repositories took longer than 20s."),
		).toBeTruthy();

		fireEvent.click(getByRole("button", { name: "Retry" }));
		expect(retries).toBe(1);
		cleanup();
	});

	test("renders nothing once every page has loaded", () => {
		const { container } = render(
			<RepositoryListStatus
				isLoading={false}
				isLoadingMore={false}
				error={null}
				onRetry={() => {}}
			/>,
		);

		expect(container.textContent).toBe("");
		cleanup();
	});
});
