import { describe, expect, test } from "bun:test";
import { createFieldDraft } from "./field-draft.ts";

/** Timers run by hand: `advance` fires the ones due. */
function fakeTimers() {
	let now = 0;
	let next = 0;
	const due = new Map<number, { at: number; run: () => void }>();
	return {
		set: (run: () => void, ms: number) => {
			due.set(++next, { at: now + ms, run });
			return next;
		},
		clear: (handle: unknown) => void due.delete(handle as number),
		advance(ms: number) {
			now += ms;
			for (const [id, t] of [...due]) {
				if (t.at > now) continue;
				due.delete(id);
				t.run();
			}
		},
	};
}

function setup() {
	const timers = fakeTimers();
	const saved: string[] = [];
	// The store, as an optimistic save leaves it.
	let stored = "Buy costume";
	const draft = createFieldDraft<string>({
		timers,
		save: (value) => {
			saved.push(value);
			stored = value;
		},
	});
	return {
		draft,
		timers,
		saved,
		stored: () => stored,
		remote: (value: string) => {
			stored = value;
		},
	};
}

describe("field draft", () => {
	test("typing saves once it pauses for 500 ms", () => {
		const { draft, timers, saved } = setup();
		draft.focus("Buy costume");
		draft.change("Buy a costume");
		timers.advance(300);
		draft.change("Buy a costume!");
		timers.advance(499);
		expect(saved).toEqual([]);
		timers.advance(1);
		expect(saved).toEqual(["Buy a costume!"]);
	});

	test("leaving the field saves at once, and only what's unsaved", () => {
		const { draft, timers, saved } = setup();
		draft.focus("Buy costume");
		draft.blur();
		expect(saved).toEqual([]);
		draft.focus("Buy costume");
		draft.change("Buy a costume");
		draft.blur();
		timers.advance(1000);
		expect(saved).toEqual(["Buy a costume"]);
		expect(draft.editing()).toBe(false);
	});

	test("flush saves pending typing (leaving the page)", () => {
		const { draft, saved } = setup();
		draft.change("Halloween");
		draft.flush();
		draft.flush();
		expect(saved).toEqual(["Halloween"]);
	});

	test("a remote edit waits while the field is edited, and shows once it's left with nothing new typed", () => {
		const { draft, timers, stored, remote } = setup();
		draft.focus(stored());
		draft.change("Mine");
		timers.advance(500);
		remote("Theirs");
		expect(draft.shown(stored())).toBe("Mine");
		draft.blur();
		expect(draft.shown(stored())).toBe("Theirs");
	});

	test("typing after a remote edit wins when the field is left: last write wins", () => {
		const { draft, stored, remote } = setup();
		draft.focus(stored());
		remote("Theirs");
		draft.change("Mine");
		draft.blur();
		expect(stored()).toBe("Mine");
		expect(draft.shown(stored())).toBe("Mine");
	});

	test("tells subscribers about each change", () => {
		const { draft } = setup();
		let heard = 0;
		const stop = draft.subscribe(() => heard++);
		const before = draft.version();
		draft.focus("a");
		draft.change("ab");
		stop();
		draft.blur();
		expect(heard).toBe(2);
		expect(draft.version()).toBe(before + 3);
	});
});
