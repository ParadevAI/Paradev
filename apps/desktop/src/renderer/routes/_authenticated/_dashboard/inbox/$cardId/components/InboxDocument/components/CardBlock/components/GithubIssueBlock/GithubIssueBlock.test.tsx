import { slackTestKit } from "../slackTestKit";

const kit = await slackTestKit();
const { describe, expect, test } = await import("bun:test");
const fx = await import("../githubFixtures");
const { GithubIssueBlock } = await import("./GithubIssueBlock");

type Props = Parameters<typeof GithubIssueBlock>[0];

const mount = (props: Partial<Props> = {}) =>
	kit.mount(GithubIssueBlock, {
		view: fx.issueView,
		actions: fx.issueActions,
		...props,
	});

const chip = (block: ReturnType<typeof mount>, field: string) =>
	block.container.querySelector(`[data-field="${field}"]`) as HTMLButtonElement;
const open = (block: ReturnType<typeof mount>, field: string) =>
	kit.act(async () => {
		await new Promise((resolve) => setTimeout(resolve, 50));
		kit.fireEvent.click(chip(block, field));
	});
const SENTENCE = (...clauses: string[]) =>
	`On lumen-labs/app#511: ${clauses.join("; ")}?`;

describe("the issue", () => {
	test("state, title, author, date, comments and the body as markdown", () => {
		const block = mount();
		expect(block.getByText("Open")).toBeTruthy();
		expect(block.getByText(fx.issueView.issue.title)).toBeTruthy();
		expect(
			(
				block.getByRole("link", {
					name: "lumen-labs/app#511",
				}) as HTMLAnchorElement
			).href,
		).toBe(fx.issueView.issue.url);
		expect(block.getByText("casey-nguyen")).toBeTruthy();
		expect(block.getByText("Opened on Sep 28, 2037")).toBeTruthy();
		expect(block.getByText("3 comments")).toBeTruthy();
		expect(block.getByRole("heading", { name: "What happened" })).toBeTruthy();
		expect(
			block.container.querySelectorAll("[data-issue-body] ol > li").length,
		).toBe(3);
	});

	test("one comment reads as one", () => {
		const block = mount({
			view: { ...fx.issueView, issue: { ...fx.issueView.issue, comments: 1 } },
		});
		expect(block.getByText("1 comment")).toBeTruthy();
	});

	test("no body says so", () => {
		const block = mount({
			view: { ...fx.issueView, issue: { ...fx.issueView.issue, body: "" } },
		});
		expect(block.getByText("No description provided.")).toBeTruthy();
	});
});

describe("labels and assignees", () => {
	test("the agent's proposal is chosen already and shown against what the issue holds", async () => {
		const block = mount();
		expect(chip(block, "labels").textContent).toBe(
			"needs triageneeds triage, bug, area: sync",
		);
		expect(chip(block, "labels").hasAttribute("data-changed")).toBe(true);
		expect(chip(block, "assignees").textContent).toBe(
			"No one assignedAavery-chen",
		);
		await block.click("Apply");
		expect(block.question()).toBe(
			SENTENCE("add labels bug, area: sync", "assign avery-chen"),
		);
		expect(block.onAct.mock.calls).toEqual([]);
		await block.confirm();
		expect(block.onAct.mock.calls).toEqual([
			[
				"apply",
				{
					labels: ["needs triage", "bug", "area: sync"],
					assignees: ["avery-chen"],
				},
			],
		]);
	});

	test("the labels menu offers every label with its description and marks the chosen", async () => {
		const block = mount();
		await open(block, "labels");
		expect(kit.options().length).toBe(12);
		expect(kit.options()[3]).toBe("bugSomething isn't working");
		expect(
			[
				...document.body.querySelectorAll("[role=option][aria-selected=true]"),
			].map((each) => each.textContent),
		).toEqual([
			"area: syncThe sync queue and its storage",
			"bugSomething isn't working",
			"needs triageNobody has looked at this yet",
		]);
	});

	test("picking and unpicking change the sentence and the input together, the issue's own first", async () => {
		const block = mount();
		await open(block, "labels");
		await kit.option(/^needs triage/);
		await kit.option(/^priority: high/);
		await kit.option(/^regression/);
		await kit.key("Filter labels", "Escape");
		await open(block, "assignees");
		expect(kit.options()).toEqual([
			"Aavery-chen",
			"Bblake-rivera",
			"Ccasey-nguyen",
			"Llena-fischer",
			"Rriley-morgan",
		]);
		await kit.option(/lena-fischer/);
		await kit.option(/avery-chen/);
		await kit.option(/blake-rivera/);
		await kit.key("Type or choose a user", "Escape");
		await block.click("Apply");
		expect(block.question()).toBe(
			SENTENCE(
				"add labels bug, area: sync, priority: high, regression",
				"remove labels needs triage",
				"assign lena-fischer, blake-rivera",
			),
		);
		await block.confirm();
		expect(block.onAct.mock.calls).toEqual([
			[
				"apply",
				{
					labels: ["bug", "area: sync", "priority: high", "regression"],
					assignees: ["lena-fischer", "blake-rivera"],
				},
			],
		]);
	});

	test("the issue's own names lead, in the issue's order, however they were picked", async () => {
		const block = mount({ view: fx.issueNoSuggestionView });
		await open(block, "labels");
		await kit.option(/^bug/);
		await kit.option(/^regression/);
		await kit.option(/^bug/);
		await kit.key("Filter labels", "Escape");
		await block.click("Apply");
		expect(block.question()).toBe(SENTENCE("add labels regression"));
		await block.confirm();
		expect(block.onAct.mock.calls).toEqual([
			[
				"apply",
				{
					labels: ["bug", "area: sync", "regression"],
					assignees: ["avery-chen"],
				},
			],
		]);
	});

	test("taking everything off names what goes", async () => {
		const block = mount({
			view: { ...fx.issueView, suggested: { labels: [], assignees: [] } },
		});
		await open(block, "labels");
		await kit.option(/^needs triage/);
		await kit.key("Filter labels", "Escape");
		expect(chip(block, "labels").textContent).toBe("needs triageLabels");
		await block.click("Apply");
		expect(block.question()).toBe(SENTENCE("remove labels needs triage"));
		await block.confirm();
		expect(block.onAct.mock.calls).toEqual([
			["apply", { labels: [], assignees: [] }],
		]);
	});

	test("a proposal taken off comes back as a suggestion to put on again", async () => {
		const block = mount();
		expect(block.container.querySelector("[data-suggestion]")).toBeNull();
		await open(block, "labels");
		await kit.option(/^bug/);
		await kit.key("Filter labels", "Escape");
		const suggestion = block.container.querySelector(
			'[data-suggestion="labels:bug"]',
		) as HTMLElement;
		expect(suggestion.textContent).toBe("bug");
		await kit.act(async () => {
			kit.fireEvent.click(suggestion);
		});
		await block.click("Apply");
		expect(block.question()).toBe(
			SENTENCE("add labels area: sync, bug", "assign avery-chen"),
		);
	});

	test("an assignee taken off is named", async () => {
		const block = mount({ view: fx.issueNoSuggestionView });
		await open(block, "assignees");
		await kit.option(/avery-chen/);
		await kit.option(/riley-morgan/);
		await kit.key("Type or choose a user", "Escape");
		await block.click("Apply");
		expect(block.question()).toBe(
			SENTENCE("assign riley-morgan", "unassign avery-chen"),
		);
		await block.confirm();
		expect(block.onAct.mock.calls).toEqual([
			["apply", { labels: ["bug", "area: sync"], assignees: ["riley-morgan"] }],
		]);
	});

	test("nothing changed, nothing to apply", async () => {
		const block = mount({ view: fx.issueNoSuggestionView });
		expect(block.button("Apply").disabled).toBe(true);
		expect(chip(block, "labels").hasAttribute("data-changed")).toBe(false);
		await open(block, "labels");
		await kit.option(/^regression/);
		expect(block.button("Apply").disabled).toBe(false);
		await kit.option(/^regression/);
		expect(block.button("Apply").disabled).toBe(true);
	});

	test("off when the reader cannot triage, while an action runs, and when done", () => {
		const block = mount({
			actions: fx.issueActions.map((action) =>
				action.id === "apply"
					? { ...action, disabled: fx.CANNOT_TRIAGE }
					: action,
			),
		});
		expect(block.button("Apply").disabled).toBe(true);
		expect(chip(block, "labels").disabled).toBe(true);
		expect(chip(block, "assignees").disabled).toBe(true);
		kit.cleanup();
		const busy = mount({ pending: true });
		expect(chip(busy, "labels").disabled).toBe(true);
		expect(busy.button("Apply").disabled).toBe(true);
		kit.cleanup();
		const done = mount({ done: true });
		expect(chip(done, "labels").disabled).toBe(true);
		expect(done.queryByRole("button", { name: "Apply" })).toBeNull();
	});
});

describe("duplicate", () => {
	test("the issue it duplicates, and closing after the server's question", async () => {
		const block = mount({
			view: fx.issueDuplicateView,
			actions: fx.issueDuplicateActions,
		});
		expect(block.container.querySelector("[data-duplicate]")?.textContent).toBe(
			"Duplicate of#498Duplicate rows in the activity list after sleepOpen",
		);
		await block.click("Close as duplicate");
		expect(block.question()).toBe(fx.CLOSE_DUPLICATE_CONFIRM);
		await block.confirm();
		expect(block.onAct.mock.calls).toEqual([
			["close_duplicate", { duplicate: 498 }],
		]);
	});

	test("no duplicate, no row and no way to close", () => {
		const block = mount({ actions: fx.issueDuplicateActions });
		expect(block.container.querySelector("[data-duplicate]")).toBeNull();
		expect(
			block.queryByRole("button", { name: "Close as duplicate" }),
		).toBeNull();
	});

	test("a closed issue cannot be closed again", () => {
		const block = mount({
			view: fx.issueClosedView,
			actions: fx.issueClosedActions,
		});
		expect(block.getByText("Closed")).toBeTruthy();
		expect(block.button("Close as duplicate").disabled).toBe(true);
	});

	test("Leave it dismisses", async () => {
		const block = mount();
		await block.click("Leave it");
		expect(block.onAct.mock.calls).toEqual([["dismiss"]]);
	});
});
