import { slackTestKit } from "../slackTestKit";

const kit = await slackTestKit();
const { describe, expect, mock, test } = await import("bun:test");
const fx = await import("../handoffFixtures");
const linear = await import("../linearFixtures");
const { HandoffBugReportBlock } = await import("./HandoffBugReportBlock");

type Props = Parameters<typeof HandoffBugReportBlock>[0];
const onConnect = mock();
const Block = (props: Omit<Props, "onConnect">) => (
	<HandoffBugReportBlock {...props} onConnect={onConnect} />
);
const mount = (props: Partial<Props> = {}) =>
	kit.mount(Block, {
		view: fx.bugReportView,
		actions: fx.bugReportActions,
		...props,
	});

const ISSUE = {
	team: linear.team.id,
	title: fx.bugDraft.title,
	description: fx.bugDraft.description,
	fields: fx.bugDraft.fields,
};
const THREAD = { channel: "C0BUGS00001", ts: fx.ROOT_TS };
const sent = (block: ReturnType<typeof mount>) =>
	block.onAct.mock.calls[0]?.[1] as {
		issue: unknown;
		reply: { text: string; blocks?: unknown[] } | null;
		thread: unknown;
	};

describe("file and reply", () => {
	test("the thread is drawn with no reply box of its own", () => {
		const block = mount();
		expect(
			block.getByText(/Login loops back to the sign-in page/),
		).toBeTruthy();
		expect(block.getByText("2 replies")).toBeTruthy();
		expect(kit.editors()).toHaveLength(1);
		expect(block.queryByRole("button", { name: "Send" })).toBeNull();
	});

	test("the question names both writes in order, and both go out", async () => {
		const block = mount();
		await block.click("File issue");
		expect(block.onAct).not.toHaveBeenCalled();
		expect(block.question()).toBe(
			'File "Login loops back to the sign-in page on Safari" in Agent Test, then reply in #bugs with the link?',
		);
		await block.confirm();
		expect(block.onAct.mock.calls).toHaveLength(1);
		expect(block.onAct.mock.calls[0]?.[0]).toBe("file");
		expect(sent(block).issue).toEqual(ISSUE);
		expect(sent(block).thread).toEqual(THREAD);
		expect(sent(block).reply?.text).toBe(fx.BUG_REPLY);
		expect(JSON.stringify(sent(block).reply?.blocks)).toContain(
			'{"type":"user","user_id":"U0AVERY4C1N"}',
		);
	});

	test("the reader's title and reply are what go out", async () => {
		const block = mount();
		await block.type("Title", "  Safari sign-in loop ");
		await kit.write(kit.editors()[0], "On it");
		await block.click("File issue");
		expect(block.question()).toBe(
			'File "Safari sign-in loop" in Agent Test, then reply in #bugs with the link?',
		);
		await block.confirm();
		expect(sent(block).issue).toEqual({
			...ISSUE,
			title: "Safari sign-in loop",
		});
		expect(sent(block).reply).toMatchObject({ text: "On it" });
	});

	test("no title or no reply: the button is off", async () => {
		const block = mount();
		await block.type("Title", " ");
		expect(block.button("File issue").disabled).toBe(true);
		await block.type("Title", "Safari sign-in loop");
		expect(block.button("File issue").disabled).toBe(false);
		await kit.write(kit.editors()[0], "");
		expect(block.button("File issue").disabled).toBe(true);
	});
});

describe("file without a reply", () => {
	test("the toggle takes the reply out of the question and the payload", async () => {
		const block = mount();
		await kit.act(async () => {
			kit.fireEvent.click(
				block.getByRole("checkbox", { name: "Reply in thread" }),
			);
		});
		expect(kit.editors()).toHaveLength(0);
		await block.click("File issue");
		expect(block.question()).toBe(
			'File "Login loops back to the sign-in page on Safari" in Agent Test?',
		);
		await block.confirm();
		expect(block.onAct.mock.calls).toEqual([
			["file", { issue: ISSUE, reply: null, thread: THREAD }],
		]);
	});

	test("Slack not connected: no reply box, the connect bar, and the issue alone", async () => {
		const block = mount({ view: fx.bugNoSlackView });
		expect(kit.editors()).toHaveLength(0);
		expect(block.queryByRole("checkbox")).toBeNull();
		await block.click("Connect Slack");
		expect(onConnect).toHaveBeenCalledWith("/plugins/slack");
		await block.click("File issue");
		expect(block.question()).toBe(
			'File "Login loops back to the sign-in page on Safari" in Agent Test?',
		);
		await block.confirm();
		expect(sent(block).reply).toBeNull();
	});

	test("not in the channel: the server's reason stands where the reply box would", () => {
		const block = mount({ view: fx.bugNotInChannelView });
		expect(block.getByText("You are not in #bugs in Slack")).toBeTruthy();
		expect(block.queryByRole("button", { name: "Connect Slack" })).toBeNull();
		expect(kit.editors()).toHaveLength(0);
	});
});

describe("filed, not replied", () => {
	const filed = () =>
		mount({ view: fx.bugFiledView, actions: fx.bugFiledActions });

	test("the filed issue is a link and the draft is read only", () => {
		const block = filed();
		const link = block.getByRole("link", {
			name: "Filed AGT-12 in Agent Test",
		}) as HTMLAnchorElement;
		expect(link.href).toBe("https://linear.app/lumen-labs/issue/AGT-12");
		expect((block.getByLabelText("Title") as HTMLInputElement).disabled).toBe(
			true,
		);
		expect(block.queryByRole("checkbox")).toBeNull();
		expect(block.queryByRole("button", { name: "File issue" })).toBeNull();
	});

	test("only the reply is asked about and sent", async () => {
		const block = filed();
		await block.click("Reply with the link");
		expect(block.question()).toBe("Reply in #bugs with the link?");
		await block.confirm();
		expect(sent(block).issue).toEqual(ISSUE);
		expect(sent(block).reply?.text).toBe(fx.BUG_REPLY);
		expect(sent(block).thread).toEqual(THREAD);
	});

	test("the way out reads Done", async () => {
		const block = filed();
		await block.click("Done");
		expect(block.onAct.mock.calls).toEqual([["dismiss"]]);
	});

	test("Slack not connected: nothing is left to send", () => {
		const block = mount({
			view: { ...fx.bugNoSlackView, filed: fx.FILED },
			actions: fx.bugFiledActions,
		});
		expect(block.button("Reply with the link").disabled).toBe(true);
	});
});

describe("the rest", () => {
	test("Do not file dismisses with no question", async () => {
		const block = mount();
		await block.click("Do not file");
		expect(block.question()).toBeNull();
		expect(block.onAct.mock.calls).toEqual([["dismiss"]]);
	});

	test("a failure is shown and the card stays open", () => {
		const block = mount({ failure: "Slack did not answer. Try again" });
		expect(block.getByRole("alert").textContent).toBe(
			"Slack did not answer. Try again",
		);
		expect(block.button("File issue")).toBeTruthy();
	});

	test("an action the reader may not take is off", () => {
		const block = mount({
			actions: [
				{ ...fx.bugReportActions[0], disabled: "Linear is not connected" },
				fx.bugReportActions[1],
			] as Props["actions"],
		});
		expect(block.button("File issue").disabled).toBe(true);
	});

	test("done: both links and nothing to press", () => {
		const block = mount({ view: fx.bugDoneView, done: true });
		expect(
			block.getByRole("link", { name: "Filed AGT-12 in Agent Test" }),
		).toBeTruthy();
		expect(block.getByRole("link", { name: "Replied in #bugs" })).toBeTruthy();
		expect(block.queryByLabelText("Title")).toBeNull();
		expect(block.queryAllByRole("button", { name: /File|Reply|Done/ })).toEqual(
			[],
		);
		expect(kit.editors()).toHaveLength(0);
	});

	test("another thread or team starts from that draft", async () => {
		const block = mount();
		await block.type("Title", "Mine");
		block.rerender(
			<kit.TooltipProvider>
				<Block
					view={{
						...fx.bugReportView,
						issue: { ...fx.bugDraft, title: "Other bug" },
						thread: {
							...fx.bugThread,
							channel: { id: "C0OTHER0001", name: "#other" },
						},
					}}
					actions={fx.bugReportActions}
					done={false}
					pending={false}
					failure={null}
					onAct={block.onAct}
				/>
			</kit.TooltipProvider>,
		);
		expect((block.getByLabelText("Title") as HTMLInputElement).value).toBe(
			"Other bug",
		);
	});
});
