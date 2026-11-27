import { expect, test } from "bun:test";
import { renderBoard } from "./render-board";

test("renders one row per workspace, grouped by host and project", () => {
	const html = renderBoard({
		result: [
			{
				id: "1",
				hostId: "mac-mini",
				projectName: "paradev",
				name: "Fix <login>",
				branch: "fix-login",
				worktreeExists: true,
			},
			{
				id: "2",
				hostId: "mac-mini",
				projectName: "paradev",
				name: "Docs",
				branch: "docs",
				worktreeExists: false,
			},
			{
				id: "3",
				hostId: "laptop",
				projectName: "paradev",
				name: "Spike",
				branch: "spike",
			},
			{ id: "4", name: "Cloud box", branch: "main", status: "awake" },
		],
	});

	expect(html.match(/<details/g)).toHaveLength(3);
	expect(html.match(/<li class="row">/g)).toHaveLength(4);
	expect(html).toContain('<span class="name">Fix &lt;login&gt;</span>');
	expect(html).toContain('<span class="branch">fix-login</span>');
	expect(html).toContain('data-tone="danger">missing</span>');
	expect(html).toContain('<span class="host">Cloud</span>');
	expect(html).toContain('data-tone="success">awake</span>');
});
