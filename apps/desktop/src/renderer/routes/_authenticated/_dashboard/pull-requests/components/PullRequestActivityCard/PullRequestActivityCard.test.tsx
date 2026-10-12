import { afterEach, describe, expect, test } from "bun:test";
import { cleanup, fireEvent, render } from "@testing-library/react";
import { PullRequestActivityLayoutProvider } from "../../providers/PullRequestActivityLayoutProvider";
import { PullRequestActivityCard } from "./PullRequestActivityCard";

afterEach(cleanup);

const author = { login: "reviewer", avatarUrl: null };

describe("activity cards", () => {
	test("on the rail the header, body and footer show at once", () => {
		const view = render(
			<PullRequestActivityCard
				author={author}
				meta={<span>approved</span>}
				createdAt="2026-10-03T10:00:00Z"
				footer={<button type="button">Resolve</button>}
			>
				<p>Looks good.</p>
			</PullRequestActivityCard>,
		);
		expect(view.getByText("Looks good.")).toBeTruthy();
		expect(view.getByRole("button", { name: "Resolve" })).toBeTruthy();
		expect(view.queryByRole("button", { name: /Expand/ })).toBeNull();
	});

	test("in a narrow pane it folds to one row that unfolds to the body and footer", () => {
		const view = render(
			<PullRequestActivityLayoutProvider value="row">
				<PullRequestActivityCard
					author={author}
					meta={<span>src/app.ts:42</span>}
					createdAt="2026-10-03T10:00:00Z"
					footer={<button type="button">Resolve</button>}
				>
					<p>Looks good.</p>
				</PullRequestActivityCard>
			</PullRequestActivityLayoutProvider>,
		);
		const row = view.getByRole("button", { name: /Expand/ });
		expect(row.textContent).toContain("reviewer");
		expect(row.textContent).toContain("src/app.ts:42");
		expect(view.queryByText("Looks good.")).toBeNull();
		fireEvent.click(row);
		expect(view.getByText("Looks good.")).toBeTruthy();
		expect(view.getByRole("button", { name: "Resolve" })).toBeTruthy();
		expect(view.getByRole("button", { name: /Collapse/ })).toBeTruthy();
	});
});
