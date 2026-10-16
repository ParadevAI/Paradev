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
const { cancelView, changeActions, rescheduleView } = await import(
	"../calendarFixtures"
);
const { CalendarChangeBlock } = await import("./CalendarChangeBlock");

afterEach(cleanup);
afterAll(async () => {
	setSystemTime();
	if (!alreadyRegistered) await GlobalRegistrator.unregister();
});

type Props = Parameters<typeof CalendarChangeBlock>[0];

function mount(overrides: Partial<Props> = {}) {
	const onAct = mock();
	const view = render(
		<TooltipProvider>
			<CalendarChangeBlock
				view={rescheduleView}
				actions={changeActions}
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
	const confirm = () =>
		act(async () => {
			fireEvent.click(
				document.body.querySelector(
					"[role='alertdialog'] [data-slot='alert-dialog-action']",
				) as HTMLElement,
			);
		});
	const field = (name: string) => view.getByRole("button", { name });
	const pickTime = async (name: string, time: RegExp) => {
		await act(async () => {
			// A popover that just closed swallows a click made in the same tick.
			await new Promise((resolve) => setTimeout(resolve, 50));
			fireEvent.click(field(name));
		});
		await act(async () => {
			fireEvent.click(view.getByRole("option", { name: time }));
		});
	};
	const pickDay = async (name: string, day: RegExp) => {
		await act(async () => {
			// A popover that just closed swallows a click made in the same tick.
			await new Promise((resolve) => setTimeout(resolve, 50));
			fireEvent.click(field(name));
		});
		await act(async () => {
			fireEvent.click(view.getByRole("button", { name: day }));
		});
	};
	return { ...view, onAct, click, confirm, field, pickTime, pickDay };
}

describe("reschedule", () => {
	test("opens on the agent's time and note, and sends them", async () => {
		const block = mount();
		expect(block.getByText("Wednesday, October 7")).toBeTruthy();
		expect(block.field("Start date").textContent).toBe("Oct 8, 2037");
		expect(block.field("Start time").textContent).toMatch(/^11:30\sAM$/);
		expect(block.getByText("1 conflict on your calendar")).toBeTruthy();
		await block.click("Reschedule");
		expect(block.onAct.mock.calls).toEqual([
			["reschedule", { ...rescheduleView.proposal, note: rescheduleView.note }],
		]);
	});

	test("an edited time and an emptied note", async () => {
		const block = mount();
		await block.pickTime("Start time", /^2:00\sPM/);
		await act(async () => {
			fireEvent.change(
				block.getByLabelText("Add an optional message for all guests"),
				{ target: { value: " " } },
			);
		});
		expect(block.queryByText(/on your calendar/)).toBeNull();
		await block.click("Reschedule");
		expect(block.onAct.mock.calls).toEqual([
			[
				"reschedule",
				{
					start: "2037-10-08T21:00:00.000Z",
					end: "2037-10-08T22:00:00.000Z",
				},
			],
		]);
	});

	test("conflicts follow the chosen time", async () => {
		const block = mount();
		await block.pickDay("Start date", /^Wednesday, October 7th/);
		await block.pickTime("Start time", /^2:30\sPM/);
		expect(block.getByText("1 conflict on your calendar")).toBeTruthy();
		expect(
			block.getByText("1 conflict on your calendar").closest("div")
				?.textContent,
		).toContain("Naming review");
	});

	test("with no time suggested, Reschedule waits for a move", () => {
		const block = mount({
			view: { ...rescheduleView, proposal: null, conflicts: [] },
		});
		expect(
			(block.getByRole("button", { name: "Reschedule" }) as HTMLButtonElement)
				.disabled,
		).toBe(true);
	});

	test("Keep as is takes no input", async () => {
		const block = mount();
		await block.click("Keep as is");
		expect(block.onAct.mock.calls).toEqual([["keep"]]);
	});
});

describe("cancel", () => {
	test("sends the note to the guests", async () => {
		const block = mount({ view: cancelView });
		expect(block.queryByRole("button", { name: "Start time" })).toBeNull();
		expect(
			(
				block.getByLabelText(
					"Add an optional message for cancellations",
				) as HTMLTextAreaElement
			).value,
		).toBe(cancelView.note);
		await block.click("Cancel event");
		expect(block.onAct).not.toHaveBeenCalled();
		expect(
			document.body.querySelector("[role='alertdialog']")?.textContent,
		).toContain("tell its 2 guests?");
		await block.confirm();
		await block.click("Keep event");
		expect(block.onAct.mock.calls).toEqual([
			["cancel", { note: cancelView.note }],
			["keep"],
		]);
	});

	test("no note sends none", async () => {
		const block = mount({ view: { ...cancelView, note: "" } });
		await block.click("Cancel event");
		await block.confirm();
		expect(block.onAct.mock.calls).toEqual([["cancel", {}]]);
	});
});

describe("states", () => {
	test("resolved: the facts stay, the controls go", () => {
		const block = mount({ done: true });
		expect(block.getByText("Cloud rollout review")).toBeTruthy();
		expect(
			block.container.querySelectorAll("button, textarea, input"),
		).toHaveLength(0);
	});

	test("an action the reader may not take is off", () => {
		const block = mount({
			actions: changeActions.map((action) =>
				action.id === "reschedule"
					? { ...action, disabled: "Only the organizer can move this event" }
					: action,
			),
		});
		expect(
			(block.getByRole("button", { name: "Reschedule" }) as HTMLButtonElement)
				.disabled,
		).toBe(true);
		expect(
			(block.getByRole("button", { name: "Keep as is" }) as HTMLButtonElement)
				.disabled,
		).toBe(false);
	});

	test("pending turns the controls off; the failure is shown", () => {
		const block = mount({ pending: true, failure: "Google said no" });
		expect(
			(block.getByRole("button", { name: "Keep as is" }) as HTMLButtonElement)
				.disabled,
		).toBe(true);
		expect((block.field("Start time") as HTMLButtonElement).disabled).toBe(
			true,
		);
		expect(block.getByRole("alert").textContent).toBe("Google said no");
	});

	test("a new time that has passed cannot be sent", () => {
		setSystemTime(new Date("2037-10-08T12:00:00-07:00"));
		const block = mount();
		const disabled = (
			block.getByRole("button", { name: "Reschedule" }) as HTMLButtonElement
		).disabled;
		setSystemTime(new Date("2037-10-01T12:00:00-07:00"));
		expect(disabled).toBe(true);
	});

	test("an event already cancelled: keep is off with the reason, cancel still settles", async () => {
		const block = mount({
			view: {
				...cancelView,
				canChange: false,
				event: { ...cancelView.event, cancelled: true },
			},
			actions: changeActions.map((action) =>
				action.id === "keep"
					? { ...action, disabled: "This event was already cancelled" }
					: action,
			),
		});
		expect(
			(block.getByRole("button", { name: "Keep event" }) as HTMLButtonElement)
				.disabled,
		).toBe(true);
		await block.click("Cancel event");
		await block.confirm();
		expect(block.onAct.mock.calls[0]?.[0]).toBe("cancel");
	});

	test("without Gmail the note box is off with the reason, and no note is sent", async () => {
		const block = mount({ view: { ...rescheduleView, canEmailNote: false } });
		expect(
			(block.container.querySelector("textarea") as HTMLTextAreaElement)
				.disabled,
		).toBe(true);
		expect(block.getByText("Reconnect Google to email a note")).toBeTruthy();
		await block.click("Reschedule");
		expect(block.onAct.mock.calls).toEqual([
			["reschedule", { ...rescheduleView.proposal }],
		]);
	});
});
