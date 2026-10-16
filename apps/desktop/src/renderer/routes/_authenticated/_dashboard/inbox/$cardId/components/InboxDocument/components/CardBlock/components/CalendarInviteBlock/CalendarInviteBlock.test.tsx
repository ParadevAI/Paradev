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
const { guests, inviteActions, inviteView } = await import(
	"../calendarFixtures"
);
const { CalendarInviteBlock } = await import("./CalendarInviteBlock");

afterEach(cleanup);
afterAll(async () => {
	setSystemTime();
	if (!alreadyRegistered) await GlobalRegistrator.unregister();
});

type Props = Parameters<typeof CalendarInviteBlock>[0];

function mount(overrides: Partial<Props> = {}) {
	const onAct = mock();
	const view = render(
		<TooltipProvider>
			<CalendarInviteBlock
				view={inviteView}
				actions={inviteActions}
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
	return { ...view, onAct, click, field, pickTime, pickDay };
}

describe("the invitation's facts", () => {
	test("the date line is in the event's zone", () => {
		const block = mount();
		expect(
			block.getByText("Tuesday, October 6 · 10:00 – 10:45 AM"),
		).toBeTruthy();
	});

	test("the guest summary counts each answer", () => {
		const block = mount();
		expect(block.getByText("6 guests")).toBeTruthy();
		expect(block.getByText("2 yes")).toBeTruthy();
		expect(block.getByText("1 no, 1 maybe, 2 awaiting")).toBeTruthy();
	});

	test("guests carry their answer, role and note", () => {
		const block = mount();
		const rows = [...block.container.querySelectorAll("li[data-response]")];
		expect(rows.map((row) => row.getAttribute("data-response"))).toEqual(
			guests.map((guest) => guest.response),
		);
		expect(rows[0]?.textContent).toBe("AAvery ChenOrganizer");
		expect(rows[2]?.textContent).toContain("Out that week");
		expect(rows[3]?.textContent).toContain("Optional");
		expect(rows[4]?.querySelector("[role='img']")).toBeNull();
		expect(
			rows[2]?.querySelector("[role='img']")?.getAttribute("aria-label"),
		).toBe("No");
	});

	test("what overlaps on the reader's calendar is listed", () => {
		const block = mount();
		expect(block.getByText("3 conflicts on your calendar")).toBeTruthy();
		expect(block.getByText("Dentist")).toBeTruthy();
		cleanup();
		const free = mount({ view: { ...inviteView, conflicts: [] } });
		expect(free.queryByText(/on your calendar/)).toBeNull();
	});
});

describe("Going?", () => {
	test("Yes, No and Maybe answer", async () => {
		const block = mount();
		await block.click("Yes");
		await block.click("No");
		await block.click("Maybe");
		expect(block.onAct.mock.calls).toEqual([
			["rsvp", { response: "accepted" }],
			["rsvp", { response: "declined" }],
			["rsvp", { response: "tentative" }],
		]);
	});

	test("the current answer is shown selected", () => {
		const block = mount({ view: { ...inviteView, response: "declined" } });
		const pressed = (name: string) =>
			block.getByRole("button", { name }).getAttribute("aria-pressed");
		expect([pressed("Yes"), pressed("No"), pressed("Maybe")]).toEqual([
			"false",
			"true",
			"false",
		]);
	});

	test("the chevron reveals the two slower answers", async () => {
		const block = mount();
		expect(block.queryByRole("button", { name: "Add note" })).toBeNull();
		await block.click("More options");
		expect(block.getByRole("button", { name: "Add note" })).toBeTruthy();
		expect(
			block.getByRole("button", { name: "Propose a new time" }),
		).toBeTruthy();
	});
});

describe("Add a note", () => {
	test("opens with the agent's note and sends it with the answer", async () => {
		const block = mount({
			view: { ...inviteView, response: "tentative", note: "Might be late." },
		});
		await block.click("More options");
		await block.click("Add note");
		const box = document.body.querySelector(
			"[role='dialog'] textarea",
		) as HTMLTextAreaElement;
		expect(box.value).toBe("Might be late.");
		await act(async () => {
			fireEvent.change(box, { target: { value: "Running ten minutes late." } });
		});
		await act(async () => {
			fireEvent.click(
				[...document.body.querySelectorAll("[role='dialog'] button")].find(
					(button) => button.textContent === "Send",
				) as HTMLElement,
			);
		});
		expect(block.onAct.mock.calls).toEqual([
			["rsvp", { response: "tentative", note: "Running ten minutes late." }],
		]);
		expect(document.body.querySelector("[role='dialog']")).toBeNull();
	});

	test("cannot send without an answer", async () => {
		const block = mount({ view: { ...inviteView, note: "See you there." } });
		await block.click("More options");
		await block.click("Add note");
		const send = [
			...document.body.querySelectorAll("[role='dialog'] button"),
		].find((button) => button.textContent === "Send") as HTMLButtonElement;
		expect(send.disabled).toBe(true);
	});
});

describe("Propose a new time", () => {
	test("sends the new time with Maybe and the message", async () => {
		const block = mount();
		await block.click("More options");
		await block.click("Propose a new time");
		expect(block.getByText("Current event time:")).toBeTruthy();
		expect(block.getByText("RSVP: Maybe")).toBeTruthy();
		const send = block.getByRole("button", {
			name: "Send proposal",
		}) as HTMLButtonElement;
		expect(send.disabled).toBe(true);
		await block.pickTime("Start time", /^1:00\sPM/);
		expect(send.disabled).toBe(false);
		await block.click("Send proposal");
		await act(async () => {
			fireEvent.change(block.getByLabelText("Add optional message"), {
				target: { value: "Mornings are packed." },
			});
		});
		await block.click("Send proposal");
		const moved = {
			start: "2037-10-06T20:00:00.000Z",
			end: "2037-10-06T20:45:00.000Z",
			response: "tentative",
		};
		expect(block.onAct.mock.calls).toEqual([
			["propose", moved],
			["propose", { ...moved, note: "Mornings are packed." }],
		]);
	});

	test("a time picked in the grid fills the fields, and its conflicts are listed", async () => {
		const block = mount();
		await block.click("More options");
		await block.click("Propose a new time");
		await act(async () => {
			fireEvent.click(
				block.getByLabelText(/Pick a time on Wednesday, October 7/),
				{ clientY: 14 * 44, detail: 1 },
			);
		});
		expect(block.field("Start date").textContent).toBe("Oct 7, 2037");
		expect(block.field("End time").textContent).toMatch(/^2:45\sPM$/);
		expect(block.getByText("1 conflict on your calendar")).toBeTruthy();
	});
});

describe("states", () => {
	test("resolved: the footer shows the answer and takes no more", () => {
		const block = mount({ done: true });
		expect(block.getByText("Offsite kickoff")).toBeTruthy();
		const buttons = [...block.container.querySelectorAll("button")];
		expect(buttons.map((button) => button.textContent)).toEqual([
			"Yes",
			"No",
			"Maybe",
		]);
		expect(buttons.every((button) => button.disabled)).toBe(true);
		expect(block.queryByRole("button", { name: "More options" })).toBeNull();
	});

	test("pending turns the answers off", () => {
		const block = mount({ pending: true });
		expect(
			(block.getByRole("button", { name: "Yes" }) as HTMLButtonElement)
				.disabled,
		).toBe(true);
	});

	test("an action the reader may not take is off", async () => {
		const block = mount({
			actions: inviteActions.map((action) => ({
				...action,
				disabled: "This invitation was forwarded to you",
			})),
		});
		const yes = block.getByRole("button", { name: "Yes" }) as HTMLButtonElement;
		expect(yes.disabled).toBe(true);
		await block.click("Yes");
		expect(block.onAct).not.toHaveBeenCalled();
	});

	test("the failure is shown", () => {
		const block = mount({ failure: "Google said no" });
		expect(block.getByRole("alert").textContent).toBe("Google said no");
	});

	test("an invitation that cannot be answered keeps its answers off", async () => {
		const block = mount({ view: { ...inviteView, canRespond: false } });
		const yes = block.getByRole("button", { name: "Yes" }) as HTMLButtonElement;
		expect(yes.disabled).toBe(true);
	});

	test("a proposed time that has passed cannot be sent", async () => {
		setSystemTime(new Date("2037-10-06T15:00:00-07:00"));
		const block = mount();
		await block.click("More options");
		await block.click("Propose a new time");
		await block.pickTime("Start time", /^1:00\sPM/);
		const disabled = (
			block.getByRole("button", { name: "Send proposal" }) as HTMLButtonElement
		).disabled;
		setSystemTime(new Date("2037-10-01T12:00:00-07:00"));
		expect(disabled).toBe(true);
	});

	test("an all-day conflict reads All day", () => {
		const block = mount({
			view: {
				...inviteView,
				conflicts: [
					{
						id: "prep",
						title: "Offsite prep day",
						start: "2037-10-06T00:00:00-07:00",
						end: "2037-10-07T00:00:00-07:00",
						allDay: true,
						response: null,
					},
				],
			},
		});
		expect(block.getByText("All day")).toBeTruthy();
	});

	test("without Gmail the propose view gives the reason and keeps the message", async () => {
		const block = mount({ view: { ...inviteView, canEmailNote: false } });
		await block.click("More options");
		await block.click("Propose a new time");
		expect(block.getByText("Reconnect Google to email a note")).toBeTruthy();
		expect(
			(block.getByLabelText("Add optional message") as HTMLTextAreaElement)
				.disabled,
		).toBe(false);
	});
});
