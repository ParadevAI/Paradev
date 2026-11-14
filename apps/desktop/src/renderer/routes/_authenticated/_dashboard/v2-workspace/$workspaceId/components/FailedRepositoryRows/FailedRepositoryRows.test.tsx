import { afterEach, expect, test } from "bun:test";
import { cleanup, render, screen } from "@testing-library/react";
import { FailedRepositoryRows } from "./FailedRepositoryRows";

(
	globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

afterEach(cleanup);

test("names each repository whose changes failed to load", () => {
	render(
		<FailedRepositoryRows
			repositories={[{ repositoryId: "repo-api", name: "api" }]}
		/>,
	);

	const row = screen.getByRole("listitem");
	expect(row.textContent).toContain("api");
	expect(row.textContent).toContain("Unable to load git status");
});

test("renders nothing when every repository loaded", () => {
	const { container } = render(<FailedRepositoryRows repositories={[]} />);
	expect(container.innerHTML).toBe("");
});
