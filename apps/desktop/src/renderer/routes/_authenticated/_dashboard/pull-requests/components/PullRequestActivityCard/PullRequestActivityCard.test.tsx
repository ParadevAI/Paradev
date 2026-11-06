import { afterEach, describe, expect, test } from "bun:test";
import { cleanup, fireEvent, render } from "@testing-library/react";
import { useState } from "react";
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

	test("a collapsed card is its header alone, which unfolds it, and a chevron folds it back", () => {
		function Harness() {
			const [collapsed, setCollapsed] = useState(true);
			return (
				<PullRequestActivityCard
					author={author}
					meta={<span>src/app.ts:42</span>}
					createdAt="2026-10-03T10:00:00Z"
					url="https://github.com/example/repo/pull/1#discussion_r1"
					actions={<button type="button">Reply</button>}
					footer={<button type="button">Unresolve</button>}
					collapsed={collapsed}
					onCollapsedChange={setCollapsed}
				>
					<p>Looks good.</p>
				</PullRequestActivityCard>
			);
		}
		const view = render(<Harness />);
		const header = view.getByRole("button", { name: /Expand/ });
		expect(header.textContent).toContain("reviewer");
		expect(header.textContent).toContain("src/app.ts:42");
		expect(view.queryByText("Looks good.")).toBeNull();
		expect(view.queryByRole("button", { name: "Reply" })).toBeNull();
		expect(view.queryByRole("link")).toBeNull();
		fireEvent.click(header);
		expect(view.getByText("Looks good.")).toBeTruthy();
		expect(view.getByRole("button", { name: "Reply" })).toBeTruthy();
		expect(view.getByRole("button", { name: "Unresolve" })).toBeTruthy();
		expect(view.getByRole("link")).toBeTruthy();
		fireEvent.click(view.getByRole("button", { name: /Collapse/ }));
		expect(view.queryByText("Looks good.")).toBeNull();
		expect(view.getByRole("button", { name: /Expand/ })).toBeTruthy();
	});
});
