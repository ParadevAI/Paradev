import { afterEach, expect, test } from "bun:test";
import type { UserContent } from "@superset/chat/protocol";
import { createElement, useEffect } from "react";

const { act, cleanup, render, renderHook } = await import(
	"@testing-library/react"
);
const { useSessionGoneHandoff } = await import("./useSessionGoneHandoff");

afterEach(cleanup);

const first: UserContent[] = [{ type: "text", text: "salut" }];
const second: UserContent[] = [{ type: "text", text: "encore" }];

type Props = { sessionId: string; checking: boolean; checkedAt: number };

function setup() {
	const queued: UserContent[][] = [];
	let rechecks = 0;
	let clock = 100;
	const view = renderHook(
		(props: Props) =>
			useSessionGoneHandoff({
				...props,
				recheck: () => rechecks++,
				onQueuePrompt: (content) => queued.push(content),
				now: () => clock,
			}),
		{ initialProps: { sessionId: "chat-a", checking: false, checkedAt: 50 } },
	);
	const hand = (prompts: UserContent[][]) => {
		let taken = false;
		act(() => {
			taken = view.result.current.onSessionGone(prompts);
		});
		return taken;
	};
	return {
		view,
		queued,
		hand,
		rechecks: () => rechecks,
		advance: (ms: number) => {
			clock += ms;
		},
	};
}

test("a refused prompt is queued while the chat is held, and the hold ends after a fresh check", () => {
	const { view, queued, hand, rechecks } = setup();

	expect(hand([first])).toBe(true);
	expect(rechecks()).toBe(1);
	expect(queued).toEqual([first]);
	expect(view.result.current.holding).toBe(true);

	view.rerender({ sessionId: "chat-a", checking: false, checkedAt: 60 });
	expect(view.result.current.holding).toBe(true);

	view.rerender({ sessionId: "chat-a", checking: false, checkedAt: 120 });
	expect(view.result.current.holding).toBe(false);
});

test("a later refusal during the hold joins the queue in order", () => {
	const { queued, hand } = setup();
	hand([first]);
	expect(hand([second])).toBe(true);
	expect(queued).toEqual([first, second]);
});

test("a session refused again within a minute goes back to the composer", () => {
	const { view, hand, advance } = setup();
	hand([first]);
	view.rerender({ sessionId: "chat-a", checking: false, checkedAt: 120 });

	advance(1_000);
	expect(hand([second])).toBe(false);

	advance(60_000);
	expect(hand([second])).toBe(true);
});

test("switching to another chat does not keep it held", () => {
	const { view, hand } = setup();
	hand([first]);
	view.rerender({ sessionId: "chat-b", checking: false, checkedAt: 60 });
	expect(view.result.current.holding).toBe(false);
});

test("a refusal from a child effect in the same commit as the fresh check is still queued", () => {
	const queued: UserContent[][] = [];
	const latest: { current: ReturnType<typeof useSessionGoneHandoff> | null } = {
		current: null,
	};
	function Child({
		fire,
		onGone,
	}: {
		fire: boolean;
		onGone: (prompts: UserContent[][]) => boolean;
	}) {
		useEffect(() => {
			if (fire) onGone([second]);
		}, [fire, onGone]);
		return null;
	}
	function Pane({ fire, checkedAt }: { fire: boolean; checkedAt: number }) {
		latest.current = useSessionGoneHandoff({
			sessionId: "chat-a",
			checking: false,
			checkedAt,
			recheck: () => {},
			onQueuePrompt: (content) => queued.push(content),
			now: () => 100,
		});
		return createElement(Child, { fire, onGone: latest.current.onSessionGone });
	}
	const view = render(createElement(Pane, { fire: false, checkedAt: 50 }));
	act(() => {
		latest.current?.onSessionGone([first]);
	});
	view.rerender(createElement(Pane, { fire: true, checkedAt: 120 }));

	expect(queued).toEqual([first, second]);
	expect(latest.current?.holding).toBe(false);
});
