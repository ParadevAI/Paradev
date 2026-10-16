import { GlobalRegistrator } from "@happy-dom/global-registrator";

const alreadyRegistered = GlobalRegistrator.isRegistered;
if (!alreadyRegistered) GlobalRegistrator.register();
(
	globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

const { afterAll, afterEach, describe, expect, mock, test } = await import(
	"bun:test"
);
mock.module("renderer/lib/clickPolicy", () => ({
	useUrlLinkAction: () => () => null,
}));
mock.module("renderer/lib/electron-trpc", () => ({
	electronTrpc: {
		createClient: () => ({}),
		external: { openUrl: { useMutation: () => ({ mutate: () => {} }) } },
	},
}));
const actualRouter = await import("@tanstack/react-router");
mock.module("@tanstack/react-router", () => ({
	...actualRouter,
	useNavigate: () => () => {},
}));
const { setSystemTime } = await import("bun:test");
setSystemTime(new Date("2037-10-01T12:00:00-07:00"));
const { act, cleanup, fireEvent, render } = await import(
	"@testing-library/react"
);
const { TooltipProvider } = await import("@superset/ui/tooltip");
const { findTimeActions, findTimeView, slackFindTimeView, slots } =
	await import("../calendarFixtures");
const { CalendarFindTimeBlock } = await import("./CalendarFindTimeBlock");

afterEach(cleanup);
afterAll(async () => {
	setSystemTime();
	if (!alreadyRegistered) await GlobalRegistrator.unregister();
});

type Props = Parameters<typeof CalendarFindTimeBlock>[0];

function mount(overrides: Partial<Props> = {}) {
	const onAct = mock();
	const view = render(
		<TooltipProvider>
			<CalendarFindTimeBlock
				view={findTimeView}
				actions={findTimeActions}
				done={false}
				pending={false}
				failure={null}
				onAct={onAct}
				{...overrides}
			/>
		</TooltipProvider>,
	);
	const click = (name: string | RegExp) =>
		act(async () => {
			fireEvent.click(view.getByRole("button", { name }));
		});
	const listed = () =>
		[...view.container.querySelectorAll("ul li span.flex-1")].map(
			(line) => line.textContent,
		);
	const confirm = () =>
		act(async () => {
			fireEvent.click(
				document.body.querySelector(
					"[role='alertdialog'] [data-slot='alert-dialog-action']",
				) as HTMLElement,
			);
		});
	return { ...view, onAct, click, listed, confirm };
}

const LINES = [
	"Tue, Oct 6, 11:30 AM – 12:00 PM PDT",
	"Tue, Oct 6, 2:00 – 2:30 PM PDT",
	"Wed, Oct 7, 9:00 – 9:30 AM PDT",
];

describe("the ask", () => {
	test("links back to where it came from", () => {
		const gmail = mount();
		expect(gmail.getByText("Open in Gmail").closest("a")?.href).toBe(
			findTimeView.ask.url as string,
		);
		expect(gmail.getByText("Quick sync on the projector?")).toBeTruthy();
		expect(gmail.getByText("30 min")).toBeTruthy();
		cleanup();
		const slack = mount({ view: slackFindTimeView });
		expect(slack.getByText("Open in Slack")).toBeTruthy();
		expect(slack.getByText("jordan@okafor.example.com")).toBeTruthy();
		expect(slack.getAllByText("Not on this thread")).toHaveLength(1);
		expect(slack.getByText(/#rollout/)).toBeTruthy();
	});
});

describe("offering times", () => {
	test("the first three suggestions are picked and listed under the reply", () => {
		const block = mount();
		expect(block.listed()).toEqual(LINES);
	});

	test("Send reply sends the picked times and the reply with them listed", async () => {
		const block = mount();
		await block.click("Send reply");
		expect(block.onAct.mock.calls).toEqual([
			[
				"offer",
				{
					slots: slots.slice(0, 3),
					version: findTimeView.ask.version,
					text: `${findTimeView.reply}\n\n${LINES.join("\n")}`,
				},
			],
		]);
	});

	test("the reply is editable and a suggestion toggles off", async () => {
		const block = mount();
		await act(async () => {
			fireEvent.change(block.getByLabelText("Reply"), {
				target: { value: "Either works:" },
			});
			fireEvent.click(block.getByLabelText(`${LINES[1]}, selected`));
		});
		await block.click("Send reply");
		expect(block.onAct.mock.calls[0]?.[1]).toEqual({
			slots: [slots[0], slots[2]],
			version: findTimeView.ask.version,
			text: `Either works:\n\n${LINES[0]}\n${LINES[2]}`,
		});
	});

	test("with nothing picked there is nothing to send", () => {
		const block = mount({ view: { ...findTimeView, slots: [] } });
		expect(block.listed()).toEqual([]);
		expect(
			(block.getByRole("button", { name: "Send reply" }) as HTMLButtonElement)
				.disabled,
		).toBe(true);
		expect(block.queryByRole("button", { name: "Create event" })).toBeNull();
	});
});

describe("creating the event", () => {
	test("several times: each line has its own Create event", async () => {
		const block = mount();
		const buttons = block.getAllByRole("button", { name: "Create event" });
		expect(buttons).toHaveLength(3);
		await act(async () => {
			fireEvent.click(buttons[1] as HTMLElement);
		});
		expect(block.onAct).not.toHaveBeenCalled();
		expect(
			document.body.querySelector("[role='alertdialog']")?.textContent,
		).toContain("email invitations to avery@lumenlabs.io");
		await block.confirm();
		expect(block.onAct.mock.calls).toEqual([
			["create_event", { ...slots[1], title: "AV setup sync" }],
		]);
	});

	test("one time: a single Create event beside Send reply", async () => {
		const block = mount({
			view: { ...findTimeView, slots: slots.slice(0, 1) },
		});
		expect(block.getAllByRole("button", { name: "Create event" })).toHaveLength(
			1,
		);
		await block.click("Create event");
		await block.confirm();
		expect(block.onAct.mock.calls).toEqual([
			["create_event", { ...slots[0], title: "AV setup sync" }],
		]);
	});
});

describe("times that have passed", () => {
	test("cannot become an event", () => {
		setSystemTime(new Date("2037-10-06T12:30:00-07:00"));
		const block = mount();
		const disabled = block
			.getAllByRole("button", { name: "Create event" })
			.map((button) => (button as HTMLButtonElement).disabled);
		setSystemTime(new Date("2037-10-01T12:00:00-07:00"));
		expect(disabled).toEqual([true, false, false]);
	});
});

describe("states", () => {
	test("resolved: the ask and the facts stay, the controls go", () => {
		const block = mount({ done: true });
		expect(block.getByText("AV setup sync")).toBeTruthy();
		expect(block.container.querySelectorAll("button, textarea")).toHaveLength(
			0,
		);
	});

	test("an action the reader may not take is off", () => {
		const block = mount({
			actions: findTimeActions.map((action) => ({
				...action,
				disabled: "Connect Slack to reply as you",
			})),
		});
		expect(
			(block.getByRole("button", { name: "Send reply" }) as HTMLButtonElement)
				.disabled,
		).toBe(true);
		expect(
			block
				.getAllByRole("button", { name: "Create event" })
				.every((button) => (button as HTMLButtonElement).disabled),
		).toBe(true);
	});

	test("pending turns the controls off; the failure is shown", () => {
		const block = mount({ pending: true, failure: "Gmail said no" });
		expect(
			(block.getByRole("button", { name: "Send reply" }) as HTMLButtonElement)
				.disabled,
		).toBe(true);
		expect(
			(block.getByLabelText("Reply") as HTMLTextAreaElement).disabled,
		).toBe(true);
		expect(block.getByRole("alert").textContent).toBe("Gmail said no");
	});

	test("without access to the ask, the reply is off and the event can still be created", () => {
		const block = mount({
			view: { ...findTimeView, canReply: false },
			actions: findTimeActions.map((action) =>
				action.id === "offer"
					? {
							...action,
							disabled: "Connect the account the ask came through to reply",
						}
					: action,
			),
		});
		expect(
			(block.getByRole("button", { name: "Send reply" }) as HTMLButtonElement)
				.disabled,
		).toBe(true);
		expect(
			block
				.getAllByRole("button", { name: "Create event" })
				.some((button) => (button as HTMLButtonElement).disabled),
		).toBe(false);
	});
});
