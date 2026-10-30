import { describe, expect, test } from "bun:test";
import { cleanup, render } from "@testing-library/react";
import { RepositoryListEmpty } from "./RepositoryListEmpty";

describe("RepositoryListEmpty", () => {
	test("keeps saying the list is loading while later pages are still pending", () => {
		const { getByText, unmount } = render(
			<RepositoryListEmpty isLoading={false} isLoadingMore />,
		);

		expect(getByText("Loading repositories...")).toBeTruthy();
		expect(() => getByText("No matches")).toThrow();
		unmount();
		cleanup();
	});

	test("says no matches once every page has loaded", () => {
		const { getByText } = render(
			<RepositoryListEmpty isLoading={false} isLoadingMore={false} />,
		);

		expect(getByText("No matches")).toBeTruthy();
		cleanup();
	});
});
