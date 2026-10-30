import { describe, expect, test } from "bun:test";
import { cleanup, fireEvent, render } from "@testing-library/react";
import { RepositoryListError } from "./RepositoryListError";

describe("RepositoryListError", () => {
	test("shows the failure and retries the failed page", () => {
		let retries = 0;
		const { getByText, getByRole } = render(
			<RepositoryListError
				message="Listing GitHub repositories took longer than 20s. Try again."
				onRetry={() => {
					retries++;
				}}
			/>,
		);

		expect(
			getByText("Listing GitHub repositories took longer than 20s. Try again."),
		).toBeTruthy();

		fireEvent.click(getByRole("button", { name: "Retry" }));
		expect(retries).toBe(1);
		cleanup();
	});
});
