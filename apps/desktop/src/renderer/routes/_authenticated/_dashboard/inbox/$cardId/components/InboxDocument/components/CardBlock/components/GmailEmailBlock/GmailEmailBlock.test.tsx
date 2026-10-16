import { describe, expect, test } from "bun:test";
import type { ComponentProps } from "react";
import { slackTestKit } from "../slackTestKit";

const { act, fireEvent, render, TooltipProvider } = await slackTestKit();
const { ActionKeysProvider } = await import(
	"../../providers/ActionKeysProvider"
);
const { assignActionKeys } = await import("../../utils/assignActionKeys");
const { actions, avery, me, message, priya, threadView } = await import(
	"./fixtures"
);
const { GmailEmailBlock } = await import("./GmailEmailBlock");

type Props = ComponentProps<typeof GmailEmailBlock>;

const fromAvery = message({
	id: "m1",
	from: avery,
	to: [me],
	text: "Who is bringing the projector?",
});
const toEveryone = message({
	id: "m2",
	from: avery,
	to: [me],
	cc: [priya],
	text: "Who is bringing the projector?",
});
const withOthers = () => {
	const view = threadView([toEveryone], { draftGone: true });
	return view.thread
		? {
				...view,
				thread: {
					...view.thread,
					replyAll: { to: [avery], cc: [priya] },
				},
			}
		: view;
};

function mount(overrides: Partial<Props> = {}) {
	const onAct = overrides.onAct ?? (() => {});
	const calls: unknown[][] = [];
	const headerSlot = document.createElement("div");
	document.body.append(headerSlot);
	const props: Props = {
		view: threadView([fromAvery], { draftGone: true }),
		headerSlot,
		actions,
		done: false,
		pending: false,
		failure: null,
		onConnect: () => {},
		...overrides,
		onAct: (...args) => {
			calls.push(args);
			onAct(...args);
		},
	};
	const view = render(
		<TooltipProvider>
			<ActionKeysProvider slots={assignActionKeys(props.actions)}>
				<GmailEmailBlock {...props} />
			</ActionKeysProvider>
		</TooltipProvider>,
	);
	const composers = () => [
		...view.container.querySelectorAll<HTMLElement>(".ProseMirror"),
	];
	const mode = () =>
		view.container.querySelector<HTMLElement>(
			'button[aria-haspopup="menu"]:is([aria-label="Reply"], [aria-label="Reply all"], [aria-label="Forward"])',
		);
	const buttonsNamed = (name: string) =>
		[...view.container.querySelectorAll("button")].filter(
			(b) => b.textContent?.trim() === name,
		);
	const send = () =>
		act(async () => {
			fireEvent.click(
				[...view.container.querySelectorAll("button")].find((b) =>
					b.textContent?.startsWith("Send"),
				) as HTMLElement,
			);
		});
	return { ...view, calls, headerSlot, composers, mode, buttonsNamed, send };
}

describe("a thread with no draft opens ready to send", () => {
	test("the reply box is open on Reply, with the sender filled in and the signature in place", () => {
		const { composers, mode, container, buttonsNamed } = mount();
		expect(composers().length).toBe(1);
		expect(mode()?.getAttribute("aria-label")).toBe("Reply");
		expect(container.textContent).toContain(avery.name);
		expect(composers()[0]?.textContent).toContain("Superset");
		expect(
			container.querySelector('[aria-label="Show trimmed content"]'),
		).not.toBeNull();
		expect(buttonsNamed("Reply")).toEqual([]);
		expect(buttonsNamed("Forward")).toEqual([]);
	});

	test("it does not take the caret", () => {
		const { composers } = mount();
		expect(composers()[0]?.contains(document.activeElement)).toBe(false);
	});

	test("reply all when the last message had other recipients", () => {
		const { mode, container } = mount({ view: withOthers() });
		expect(mode()?.getAttribute("aria-label")).toBe("Reply all");
		expect(container.textContent).toContain(priya.name);
	});

	test("Send goes out as a new reply to the last message", async () => {
		const { calls, send } = mount({ view: withOthers() });
		await send();
		expect(calls.length).toBe(1);
		expect(calls[0]?.[0]).toBe("compose");
		expect(calls[0]?.[1]).toMatchObject({
			mode: "reply",
			of: "m2",
			to: [`${avery.name} <${avery.email}>`],
			cc: [`${priya.name} <${priya.email}>`],
		});
	});

	test("Forward is in the box's mode switcher", async () => {
		const { mode } = mount();
		await act(async () => {
			fireEvent.pointerDown(mode() as HTMLElement, {
				button: 0,
				pointerType: "mouse",
			});
		});
		const items = [...document.body.querySelectorAll("[role=menuitem]")];
		expect(items.map((item) => item.textContent?.trim())).toEqual([
			"Reply",
			"Reply all",
			"Forward",
		]);
		await act(async () => {
			fireEvent.click(items[2] as HTMLElement);
		});
		expect(mode()?.getAttribute("aria-label")).toBe("Forward");
	});

	test("no box when the reader cannot write: settled, or no compose action", () => {
		expect(mount({ done: true }).composers()).toEqual([]);
		expect(
			mount({
				actions: actions.filter((a) => a.id !== "compose"),
			}).composers(),
		).toEqual([]);
	});
});

describe("a thread with a draft", () => {
	test("keeps the one box, holding the draft, and Send sends the draft", async () => {
		const { calls, composers, send } = mount({
			view: threadView([fromAvery], {}, "I'll bring the projector."),
		});
		expect(composers().length).toBe(1);
		expect(composers()[0]?.textContent).toContain("I'll bring the projector.");
		await send();
		expect(calls[0]?.[0]).toBe("send");
	});
});

describe("the card's header row", () => {
	test("holds archive, This is nothing and the way to Gmail, with their keys", async () => {
		const { calls, container, headerSlot } = mount();
		const archive = headerSlot.querySelector(
			'[aria-label="Archive"]',
		) as HTMLElement;
		const nothing = [...headerSlot.querySelectorAll("button")].find((b) =>
			b.textContent?.includes("This is nothing"),
		) as HTMLElement;
		expect(archive.getAttribute("data-action-key")).toBe("2");
		expect(nothing.getAttribute("data-action-key")).toBe("dismiss");
		expect(
			headerSlot.querySelector('a[href^="https://mail.google.com"]')
				?.textContent,
		).toContain("Open in Gmail");
		expect(container.querySelector('[aria-label="Archive"]')).toBeNull();
		expect(container.textContent).not.toContain("This is nothing");
		await act(async () => {
			fireEvent.click(archive);
		});
		await act(async () => {
			fireEvent.click(nothing);
		});
		expect(calls).toEqual([["archive"], ["nothing"]]);
	});

	test("a settled card keeps only the way to Gmail", () => {
		const { headerSlot } = mount({ done: true });
		expect(headerSlot.querySelectorAll("button").length).toBe(0);
		expect(headerSlot.querySelectorAll("a").length).toBe(1);
	});
});
