import { slackTestKit } from "../slackTestKit";

const kit = await slackTestKit();
const { describe, expect, test } = await import("bun:test");
const fx = await import("../handoffFixtures");
const linear = await import("../linearFixtures");
const { SentryIssueBlock } = await import("./SentryIssueBlock");

type Props = Parameters<typeof SentryIssueBlock>[0];
type StartProps = import("react").ComponentProps<Props["StartAgent"]>;

let started: StartProps | null = null;
function StartAgent(props: StartProps) {
	started = props;
	return props.trigger;
}
const Block = (props: Omit<Props, "StartAgent">) => (
	<SentryIssueBlock {...props} StartAgent={StartAgent} />
);
const mount = (props: Partial<Props> = {}) => {
	started = null;
	return kit.mount(Block, {
		view: fx.sentryView,
		actions: fx.sentryActions,
		...props,
	});
};
const without = (id: string) =>
	fx.sentryActions.filter((action) => action.id !== id);
const ISSUE = {
	team: linear.team.id,
	title: fx.sentryDraft.title,
	description: fx.sentryDraft.description,
	fields: fx.sentryDraft.fields,
};
const open = (block: ReturnType<typeof mount>, name: string) =>
	kit.act(async () => {
		await new Promise((resolve) => setTimeout(resolve, 50));
		kit.fireEvent.click(block.button(name));
	});

describe("header", () => {
	test("level, title, message, place, project and the way to Sentry", () => {
		const block = mount();
		expect(block.getByText("Error")).toBeTruthy();
		expect(block.queryByText("Unresolved")).toBeNull();
		expect(
			block.getByText(
				"TypeError: Cannot read properties of undefined (reading 'id')",
			),
		).toBeTruthy();
		expect(
			block.getByText("Cannot read properties of undefined (reading 'id')"),
		).toBeTruthy();
		expect(
			block.queryByText("usePaneTitle(src/renderer/panes/usePaneTitle)"),
		).toBeNull();
		expect(
			block.getByText("src/renderer/panes/usePaneTitle.ts · usePaneTitle"),
		).toBeTruthy();
		expect(block.getByText("desktop")).toBeTruthy();
		expect(block.getByText("DESKTOP-4K2")).toBeTruthy();
		expect(
			(block.getByRole("link", { name: "Open in Sentry" }) as HTMLAnchorElement)
				.href,
		).toBe("https://lumen-labs.sentry.io/issues/6723918452/");
	});

	test("the numbers, with times relative to now", () => {
		const block = mount();
		const stats = [...block.container.querySelectorAll("dl > div")].map(
			(each) => each.textContent,
		);
		expect(stats).toEqual([
			"Events1,284",
			"Users73",
			"First seen3 days ago",
			"Last seen19 minutes ago",
		]);
	});

	test("with no file or function the culprit is the place", () => {
		const block = mount({
			view: {
				...fx.sentryView,
				issue: {
					...fx.sentryView.issue,
					level: "warning",
					error: { type: null, value: null, filename: null, function: null },
				},
			},
		});
		expect(block.getByText("Warning")).toBeTruthy();
		expect(
			block.getByText("usePaneTitle(src/renderer/panes/usePaneTitle)"),
		).toBeTruthy();
	});
});

describe("assignee", () => {
	test("picking a member assigns at once, with no question", async () => {
		const block = mount();
		expect(block.button("Assignee").textContent).toBe("Unassigned");
		await open(block, "Assignee");
		expect(kit.options()).toEqual([
			"Unassigned",
			"AAvery Chenavery@lumenlabs.example",
			"BBlake Rivera",
			"RRiley Morganriley@lumenlabs.example",
		]);
		await kit.option(/Avery Chen/);
		expect(block.question()).toBeNull();
		expect(block.onAct.mock.calls).toEqual([
			["assign", { assignee: "3100202" }],
		]);
	});

	test("Unassigned takes it from whoever has it", async () => {
		const block = mount({ view: fx.sentryAssignedView });
		expect(block.button("Assignee").textContent).toBe("AAvery Chen");
		await open(block, "Assignee");
		await kit.option("Unassigned");
		expect(block.onAct.mock.calls).toEqual([["assign", { assignee: null }]]);
	});

	test("off when the card may not assign, while it works, and when done", () => {
		expect(
			mount({ actions: without("assign") }).button("Assignee").disabled,
		).toBe(true);
		kit.cleanup();
		expect(mount({ pending: true }).button("Assignee").disabled).toBe(true);
		kit.cleanup();
		expect(mount({ done: true }).button("Assignee").disabled).toBe(true);
	});
});

describe("status", () => {
	test("Resolve asks the server's question", async () => {
		const block = mount();
		await block.click("Resolve");
		expect(block.question()).toBe("Resolve DESKTOP-4K2 in Sentry?");
		await block.confirm();
		expect(block.onAct.mock.calls).toEqual([["resolve"]]);
	});

	test("Archive asks the server's question", async () => {
		const block = mount();
		await block.click("Archive");
		expect(block.question()).toBe(
			"Archive DESKTOP-4K2 in Sentry? It comes back if it escalates.",
		);
		await block.confirm();
		expect(block.onAct.mock.calls).toEqual([["ignore"]]);
	});

	test("an action the server turned off is off", () => {
		const block = mount({
			view: fx.sentryResolvedView,
			actions: fx.sentryActions.map((action) =>
				action.id === "resolve"
					? { ...action, disabled: "Already resolved" }
					: action,
			),
		});
		expect(block.button("Resolve").disabled).toBe(true);
		expect(block.button("Archive").disabled).toBe(false);
	});

	test("Leave it dismisses", async () => {
		const block = mount();
		await block.click("Leave it");
		expect(block.onAct.mock.calls).toEqual([["dismiss"]]);
	});
});

describe("file in Linear", () => {
	test("the draft opens, and filing names the issue and the note", async () => {
		const block = mount();
		expect(block.queryByLabelText("Title")).toBeNull();
		await block.click("File in Linear");
		expect((block.getByLabelText("Title") as HTMLInputElement).value).toBe(
			fx.sentryDraft.title,
		);
		await block.click("File issue");
		expect(block.question()).toBe(
			'File "DESKTOP-4K2: TypeError: Cannot read properties of undefined" in Agent Test, then add a note on DESKTOP-4K2 with the link?',
		);
		await block.confirm();
		expect(block.onAct.mock.calls).toEqual([["file_linear", { issue: ISSUE }]]);
	});

	test("the reader's title is in the question and the payload", async () => {
		const block = mount();
		await block.click("File in Linear");
		await block.type("Title", "Pane title crash");
		await block.click("File issue");
		expect(block.question()).toBe(
			'File "Pane title crash" in Agent Test, then add a note on DESKTOP-4K2 with the link?',
		);
		await block.confirm();
		expect(block.onAct.mock.calls).toEqual([
			["file_linear", { issue: { ...ISSUE, title: "Pane title crash" } }],
		]);
	});

	test("no draft from the agent: no button", () => {
		const block = mount({
			view: fx.sentryNoLinearView,
			actions: without("file_linear"),
		});
		expect(block.queryByRole("button", { name: "File in Linear" })).toBeNull();
	});

	test("a draft that could not be read says why", () => {
		const block = mount({
			view: {
				...fx.sentryNoLinearView,
				linearUnavailable: "Linear has no team with that key for you",
			},
			actions: without("file_linear"),
		});
		expect(
			block.getByText("Linear has no team with that key for you"),
		).toBeTruthy();
	});

	test("filed and noted: both links, no editor, and the way out reads Done", () => {
		const block = mount({
			view: fx.sentryFiledView,
			actions: fx.sentryActions.map((action) =>
				action.id === "file_linear"
					? { ...action, disabled: fx.ALREADY_FILED }
					: action,
			),
		});
		expect(
			(
				block.getByRole("link", {
					name: "Filed AGT-12 in Agent Test",
				}) as HTMLAnchorElement
			).href,
		).toBe("https://linear.app/lumen-labs/issue/AGT-12");
		expect(
			block.getByRole("link", { name: "Added a note on DESKTOP-4K2" }),
		).toBeTruthy();
		expect(block.queryByRole("button", { name: "Add the note" })).toBeNull();
		expect(block.queryByRole("button", { name: "File in Linear" })).toBeNull();
		expect(block.queryByLabelText("Title")).toBeNull();
		expect(block.button("Done")).toBeTruthy();
	});

	test("filed, the note failed: only the note is asked about", async () => {
		const block = mount({ view: { ...fx.sentryView, filed: fx.FILED } });
		await block.click("Add the note");
		expect(block.question()).toBe("Add a note on DESKTOP-4K2 with the link?");
		await block.confirm();
		expect(block.onAct.mock.calls).toEqual([["file_linear", { issue: ISSUE }]]);
	});
});

describe("start an agent", () => {
	test("the popover gets one task that is linked to no task of ours", () => {
		mount();
		expect(started?.tasks).toEqual([
			{
				id: "6723918452",
				slug: "DESKTOP-4K2",
				title: "TypeError: Cannot read properties of undefined (reading 'id')",
				description: fx.sentryView.fix.prompt,
				branch: null,
				linked: false,
			},
		]);
	});

	test("the card is told the workspace once it exists", async () => {
		const block = mount();
		expect(block.button("Start an agent to fix it")).toBeTruthy();
		await kit.act(async () => {
			started?.onComplete();
		});
		expect(block.onAct).not.toHaveBeenCalled();
		await kit.act(async () => {
			started?.onCreated?.(["0b9f6c1e-0000-4000-8000-000000000001"]);
		});
		expect(block.onAct.mock.calls).toEqual([
			["started", { workspace: "0b9f6c1e-0000-4000-8000-000000000001" }],
		]);
	});

	test("no action, no button", () => {
		const block = mount({ actions: without("started") });
		expect(
			block.queryByRole("button", { name: "Start an agent to fix it" }),
		).toBeNull();
	});
});

describe("the rest", () => {
	test("a failure is shown", () => {
		const block = mount({ failure: "Sentry did not answer. Try again" });
		expect(block.getByRole("alert").textContent).toBe(
			"Sentry did not answer. Try again",
		);
	});

	test("another issue starts from its own draft", async () => {
		const block = mount();
		await block.click("File in Linear");
		await block.type("Title", "Mine");
		await kit.act(async () => {
			block.rerender(
				<kit.TooltipProvider>
					<Block
						view={{
							...fx.sentryView,
							issue: { ...fx.sentryView.issue, id: "777" },
						}}
						actions={fx.sentryActions}
						done={false}
						pending={false}
						failure={null}
						onAct={block.onAct}
					/>
				</kit.TooltipProvider>,
			);
		});
		expect(block.queryByLabelText("Title")).toBeNull();
		await block.click("File in Linear");
		expect((block.getByLabelText("Title") as HTMLInputElement).value).toBe(
			fx.sentryDraft.title,
		);
	});

	test("done: the header and links stay, the actions go", () => {
		const block = mount({ view: fx.sentryResolvedView, done: true });
		expect(
			block.getByRole("link", { name: "Filed AGT-12 in Agent Test" }),
		).toBeTruthy();
		expect(
			block.queryByRole("button", { name: /Resolve|Archive|Leave|Start|File/ }),
		).toBeNull();
	});
});
