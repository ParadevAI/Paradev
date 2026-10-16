import { supersetTestKit } from "../supersetTestKit";

const kit = await supersetTestKit();
const { describe, expect, test } = await import("bun:test");
const { within } = await import("@testing-library/react");
const fx = await import("../supersetFixtures");
const { PrReviewBlock } = await import("./PrReviewBlock");

type Props = Parameters<typeof PrReviewBlock>[0];
const Block = kit.inApp(PrReviewBlock);
const mount = (props: Partial<Props> = {}) =>
	kit.mount(Block, {
		view: fx.reviewView,
		actions: fx.reviewActions,
		...props,
	});
const threads = (block: ReturnType<typeof mount>) =>
	[...block.container.querySelectorAll(".pr-diff-comment")].map((thread) => ({
		box: thread.parentElement as HTMLElement,
		...within(thread.parentElement as HTMLElement),
	}));
const write = (box: HTMLElement, value: string) =>
	kit.act(async () => {
		kit.fireEvent.change(within(box).getByPlaceholderText("Write a reply…"), {
			target: { value },
		});
	});
const press = (button: HTMLElement) =>
	kit.act(async () => {
		kit.fireEvent.click(button);
	});

describe("the pull request", () => {
	test("its state, number, title and changed lines, over the workspace", () => {
		const block = mount();
		const link = block.getByRole("link", { name: "#497" }) as HTMLAnchorElement;
		expect(link.href).toBe(fx.cloudPullRequest.url);
		expect(block.getByText(fx.cloudPullRequest.title)).toBeTruthy();
		expect(block.getByText("Open")).toBeTruthy();
		expect(block.getByText("+212")).toBeTruthy();
		expect(block.getAllByText(fx.cloudWorkspace.name).length).toBeGreaterThan(
			0,
		);
	});

	test("a draft says Draft, and a host's pull request has no line counts", () => {
		const draft = mount({ view: fx.reviewDraftView });
		expect(draft.getByText("Draft")).toBeTruthy();
		kit.cleanup();
		const local = mount({ view: fx.reviewLocalView });
		expect(local.getByRole("link", { name: "#482" })).toBeTruthy();
		expect(local.queryByText(/^\+\d+$/)).toBeNull();
	});
});

describe("threads", () => {
	test("each open thread with its file, line and comments", () => {
		const block = mount();
		const [retry, backoff] = threads(block);
		expect(threads(block).length).toBe(2);
		expect(
			retry?.getByText("packages/sync/src/queue/retry.ts:48"),
		).toBeTruthy();
		expect(retry?.getByText("1 comment")).toBeTruthy();
		expect(retry?.getByText("jonas-lind")).toBeTruthy();
		expect(retry?.getByText(/Cap it at five attempts\?/)).toBeTruthy();
		expect(
			retry?.getByRole("link", { name: "Open on GitHub" }).getAttribute("href"),
		).toBe(fx.retryThread.comments[0]?.url ?? "");
		expect(
			backoff?.getByText("packages/sync/src/queue/backoff.ts:12"),
		).toBeTruthy();
		expect(backoff?.getByText("2 comments")).toBeTruthy();
		expect(backoff?.getByText("Agreed. Clamp once, at the end.")).toBeTruthy();
	});

	test("an outdated thread with no line is marked and starts closed", async () => {
		const block = mount({ view: fx.reviewOutdatedView });
		const outdated = threads(block)[1];
		expect(
			outdated?.getByText("packages/sync/src/queue/lease.ts"),
		).toBeTruthy();
		expect(outdated?.getByText("Outdated")).toBeTruthy();
		expect(outdated?.queryByPlaceholderText("Write a reply…")).toBeNull();
		await press(
			outdated?.getByRole("button", { name: "Expand thread" }) as HTMLElement,
		);
		expect(outdated?.getByPlaceholderText("Write a reply…")).toBeTruthy();
	});

	test("a reply goes to its own thread, trimmed, and the box clears", async () => {
		const block = mount();
		const backoff = threads(block)[1];
		const box = backoff?.box as HTMLElement;
		const reply = backoff?.getByRole("button", {
			name: "Reply",
		}) as HTMLButtonElement;
		expect(reply.disabled).toBe(true);
		await write(box, "   ");
		expect(reply.disabled).toBe(true);
		await write(box, "  Clamped after the jitter now.  ");
		await press(reply);
		expect(block.onAct.mock.calls).toEqual([
			[
				"reply",
				{ thread: fx.backoffThread.id, body: "Clamped after the jitter now." },
			],
		]);
		expect(
			(
				within(box).getByPlaceholderText(
					"Write a reply…",
				) as HTMLTextAreaElement
			).value,
		).toBe("");
	});

	test("Cmd+Enter sends the reply", async () => {
		const block = mount({ view: fx.reviewOneThreadView });
		const box = threads(block)[0]?.box as HTMLElement;
		await write(box, "Capped at five.");
		await kit.act(async () => {
			kit.fireEvent.keyDown(
				within(box).getByPlaceholderText("Write a reply…"),
				{
					key: "Enter",
					metaKey: true,
				},
			);
		});
		expect(block.onAct.mock.calls).toEqual([
			["reply", { thread: fx.retryThread.id, body: "Capped at five." }],
		]);
	});

	test("resolve names its own thread", async () => {
		const block = mount();
		await press(
			threads(block)[0]?.getByRole("button", {
				name: "Resolve conversation",
			}) as HTMLElement,
		);
		expect(block.onAct.mock.calls).toEqual([
			["resolve", { thread: fx.retryThread.id, resolved: true }],
		]);
	});

	test("while an action runs, no thread can be replied to or resolved", async () => {
		const block = mount({ pending: true });
		const retry = threads(block)[0];
		await write(retry?.box as HTMLElement, "Capped at five.");
		const reply = retry?.getByRole("button", {
			name: "Reply",
		}) as HTMLButtonElement;
		const resolve = retry?.getByRole("button", {
			name: "Resolve conversation",
		}) as HTMLButtonElement;
		expect(reply.disabled).toBe(true);
		expect(resolve.disabled).toBe(true);
		await press(reply);
		await press(resolve);
		expect(block.onAct).not.toHaveBeenCalled();
	});
});

describe("address with agent", () => {
	test("is the only action in the bar", () => {
		const block = mount();
		expect(block.queryByRole("button", { name: "Resolve" })).toBeNull();
		expect(block.getAllByRole("button", { name: "Reply" }).length).toBe(2);
		expect(block.button("Address with agent").disabled).toBe(false);
	});

	test("sends the optional note", async () => {
		const block = mount();
		await block.click("Address with agent");
		expect(block.onAct).not.toHaveBeenCalled();
		await block.type(fx.NOTE_INPUT, " Keep the public API as it is. ");
		await block.click("Address with agent");
		expect(block.onAct.mock.calls).toEqual([
			["address", "Keep the public API as it is."],
		]);
	});

	test("sends with no note", async () => {
		const block = mount();
		await block.click("Address with agent");
		await block.click("Address with agent");
		expect(block.onAct.mock.calls).toEqual([["address", undefined]]);
	});

	test("with no open thread it is off, and says why", async () => {
		const block = mount({
			view: fx.reviewNoThreadsView,
			actions: fx.reviewNoThreadsActions,
		});
		expect(threads(block).length).toBe(0);
		const address = block.button("Address with agent");
		expect(address.disabled).toBe(true);
		await press(address);
		expect(block.queryByLabelText(fx.NOTE_INPUT)).toBeNull();
		expect(block.onAct).not.toHaveBeenCalled();
		expect(await kit.reason(address)).toBe(fx.NO_OPEN_THREAD);
	});
});

describe("states", () => {
	test("a resolved card keeps the threads to read and takes no action", () => {
		const block = mount({ done: true });
		expect(
			block.queryByRole("button", { name: "Address with agent" }),
		).toBeNull();
		expect(threads(block).length).toBe(2);
		for (const thread of threads(block))
			expect(thread.box.hasAttribute("inert")).toBe(true);
		expect(block.getByText(/Cap it at five attempts\?/)).toBeTruthy();
	});

	test("an open card's threads are not inert", () => {
		const block = mount();
		for (const thread of threads(block))
			expect(thread.box.hasAttribute("inert")).toBe(false);
	});

	test("the failure sentence is shown above the action", () => {
		const block = mount({ failure: "That thread is no longer open" });
		expect(block.getByText("That thread is no longer open")).toBeTruthy();
	});

	test("many threads with long paths are all in the page", () => {
		const block = mount({ view: fx.reviewLongView });
		expect(threads(block).length).toBe(8);
		expect(
			block.getByText(fx.reviewLongView.threads[0]?.path.concat(":101") ?? ""),
		).toBeTruthy();
	});
});
