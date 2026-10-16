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
const { act, cleanup, fireEvent, render } = await import(
	"@testing-library/react"
);
const { TooltipProvider } = await import("@superset/ui/tooltip");
const { ActionKeysProvider } = await import(
	"../../providers/ActionKeysProvider"
);
const { assignActionKeys } = await import("../../utils/assignActionKeys");
const { actions, messages, thread } = await import("./fixtures");
const { SlackThreadBlock } = await import("./SlackThreadBlock");

afterEach(cleanup);
afterAll(async () => {
	if (!alreadyRegistered) await GlobalRegistrator.unregister();
});

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

function mount(view = thread(), done = false) {
	const onAct = mock();
	const headerSlot = document.createElement("div");
	document.body.append(headerSlot);
	const result = render(
		<TooltipProvider>
			<ActionKeysProvider slots={assignActionKeys(actions)}>
				<SlackThreadBlock
					view={view}
					headerSlot={headerSlot}
					actions={actions}
					done={done}
					pending={false}
					failure={null}
					onAct={onAct}
					onConnect={mock()}
				/>
			</ActionKeysProvider>
		</TooltipProvider>,
	);
	return { ...result, onAct, headerSlot };
}

const visibleText = (selector: string) =>
	[...document.body.querySelectorAll(selector)].map((e) =>
		(e.textContent ?? "").trim(),
	);

describe("the card's header row", () => {
	test("holds Leave it with its key and the way to Slack", async () => {
		const { container, headerSlot, onAct } = mount();
		const leave = [...headerSlot.querySelectorAll("button")].find((b) =>
			b.textContent?.includes("Leave it"),
		) as HTMLElement;
		expect(leave.getAttribute("data-action-key")).toBe("dismiss");
		expect(headerSlot.querySelector("a")?.getAttribute("href")).toBe(
			thread().permalink,
		);
		expect(container.textContent).not.toContain("Leave it");
		await act(async () => fireEvent.click(leave));
		expect(onAct.mock.calls).toEqual([["leave"]]);
	});

	test("a settled card keeps only the way to Slack", () => {
		const { headerSlot } = mount(thread(), true);
		expect(headerSlot.querySelectorAll("button").length).toBe(0);
		expect(headerSlot.querySelectorAll("a").length).toBe(1);
	});
});

describe("the hover toolbar is Slack's", () => {
	test("three quick reactions, Add reaction…, Open in Slack and More actions", () => {
		const { container } = mount();
		const bar = container.querySelector(
			".group\\/msg .absolute",
		) as HTMLElement;
		expect(
			[...bar.querySelectorAll("button")].map((b) =>
				b.getAttribute("aria-label"),
			),
		).toEqual([
			"React with white_check_mark",
			"React with eyes",
			"React with raised_hands",
			"Add reaction…",
			"Open in Slack",
			"More actions",
		]);
	});

	test("quick reactions carry Slack's tooltips and react with Slack's names", async () => {
		const { container, onAct } = mount();
		const eyes = container.querySelector(
			'[aria-label="React with eyes"]',
		) as HTMLElement;
		await act(async () => {
			fireEvent.focus(eyes);
			await wait(350);
		});
		expect(visibleText("[role=tooltip]")).toContain("Taking a look…");
		await act(async () => fireEvent.click(eyes));
		expect(onAct.mock.calls[0]?.[1]).toMatch(/ eyes$/);
	});

	test("More actions lists what works from here, with Slack's keys, and L copies the link", async () => {
		const writeText = mock(async () => {});
		Object.defineProperty(navigator, "clipboard", {
			value: { writeText },
			configurable: true,
		});
		const { container } = mount();
		const more = container.querySelector(
			'[aria-label="More actions"]',
		) as HTMLElement;
		await act(async () => {
			fireEvent.pointerDown(more, { button: 0, pointerType: "mouse" });
		});
		expect(
			visibleText("[role=menuitem]").map((t) => t.replace(/(⌘|Ctrl\+)C$/, "")),
		).toEqual(["Copy linkL", "Copy message", "Open in Slack"]);
		const menu = document.body.querySelector("[role=menu]") as HTMLElement;
		await act(async () => fireEvent.keyDown(menu, { key: "l" }));
		expect(writeText).toHaveBeenCalledWith(
			expect.stringContaining("slack.com/archives"),
		);
	});
});

describe("right-click on a message opens the same menu", () => {
	test("on the text: the More actions items", async () => {
		const { container } = mount();
		const row = container.querySelector(".group\\/msg") as HTMLElement;
		await act(async () => fireEvent.contextMenu(row));
		expect(
			visibleText("[role=menuitem]").map((t) => t.replace(/(⌘|Ctrl\+)C$/, "")),
		).toEqual(["Copy linkL", "Copy message", "Open in Slack"]);
	});

	test("on a link: Open link and Copy link address first", async () => {
		const { container } = mount();
		const link = container.querySelector(
			'a[href^="https://github.com"]',
		) as HTMLElement;
		await act(async () => fireEvent.contextMenu(link));
		expect(visibleText("[role=menuitem]").slice(0, 2)).toEqual([
			"Open link",
			"Copy link address",
		]);
	});
});

describe("reaction pills", () => {
	test("the tooltip names who reacted, the reader first as Slack writes it", async () => {
		const { container } = mount();
		const mine = [...container.querySelectorAll("button")].find(
			(b) => b.className.includes("sky-500") && b.textContent?.includes("1"),
		) as HTMLElement;
		await act(async () => {
			fireEvent.focus(mine);
			await wait(350);
		});
		expect(visibleText("[role=tooltip]").join(" ")).toContain(
			"You (click to remove) reacted with :white_check_mark:",
		);
	});

	test("clicking your own pill removes your reaction", async () => {
		const { container, onAct } = mount();
		const mine = [...container.querySelectorAll("button")].find((b) =>
			b.className.includes("sky-500"),
		) as HTMLElement;
		await act(async () => fireEvent.click(mine));
		expect(onAct.mock.calls[0]?.[1]).toMatch(/ white_check_mark remove$/);
	});
});

describe("the person card", () => {
	test("hovering a name shows role, photo, name with (you), local time and a way into Slack", async () => {
		const owner = {
			...messages.question.user,
			role: "owner" as const,
			isReader: true,
		};
		const { container } = mount(
			thread({
				messages: [{ ...messages.question, user: owner }],
				members: [owner],
			}),
		);
		const name = [...container.querySelectorAll("button, span")].find(
			(e) =>
				e.children.length === 0 &&
				e.textContent === messages.question.user.name,
		) as HTMLElement;
		await act(async () => {
			fireEvent.pointerEnter(name);
			await wait(500);
		});
		const card = document.body.querySelector(
			"[data-radix-popper-content-wrapper]",
		);
		expect(card?.textContent).toContain("Workspace Owner");
		expect(card?.textContent).toContain(`${messages.question.user.name} (you)`);
		expect(card?.textContent).toContain("Open in Slack");
	});
});

describe("a long thread", () => {
	test("shows the latest eight replies under Show N more replies, which unfolds them", async () => {
		const replies = Array.from({ length: 15 }, (_, i) => ({
			...messages.willDo,
			ts: String(1787255200 + i),
			text: `reply ${i + 1}`,
		}));
		const { container, getByText } = mount(
			thread({ messages: [messages.question, ...replies] }),
		);
		expect(container.textContent).toContain("Show 7 more replies");
		expect(container.textContent).not.toContain("reply 1 ");
		await act(async () => fireEvent.click(getByText("Show 7 more replies")));
		expect(container.textContent).toContain("reply 1");
	});
});
