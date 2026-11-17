import { describe, expect, test } from "bun:test";
import { createPresenceReporter, type Presence } from "./presence.ts";

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

function setup(fail = false) {
	const timers = fakeTimers();
	const sent: Presence[] = [];
	const reporter = createPresenceReporter({
		send: async (p) => {
			sent.push(p);
			if (fail) throw new Error("offline");
		},
		timers,
	});
	return { reporter, timers, sent };
}

const reading = (groupId: string | null): Presence => ({
	active: true,
	groupId,
});
const away: Presence = { active: false, groupId: null };

describe("createPresenceReporter", () => {
	test("a change is sent after a short pause, so moving through chats sends only where the person lands", () => {
		const { reporter, timers, sent } = setup();
		reporter.set(reading("a"));
		timers.advance(100);
		reporter.set(reading("b"));
		timers.advance(299);
		expect(sent).toEqual([]);
		timers.advance(1);
		expect(sent).toEqual([reading("b")]);
	});

	test("going inactive is sent at once, and nothing is repeated while inactive", () => {
		const { reporter, timers, sent } = setup();
		reporter.set(reading("a"));
		timers.advance(300);
		reporter.set(away);
		expect(sent).toEqual([reading("a"), away]);
		timers.advance(120_000);
		expect(sent).toHaveLength(2);
	});

	test("an active app says so again every 30 s", () => {
		const { reporter, timers, sent } = setup();
		reporter.set(reading("a"));
		timers.advance(300);
		timers.advance(30_000);
		timers.advance(30_000);
		expect(sent).toEqual([reading("a"), reading("a"), reading("a")]);
	});

	test("the same presence again, or a change undone before it's sent, sends nothing new", () => {
		const { reporter, timers, sent } = setup();
		reporter.set(reading("a"));
		timers.advance(300);
		reporter.set(reading("a"));
		reporter.set(reading("b"));
		reporter.set(reading("a"));
		timers.advance(1_000);
		expect(sent).toEqual([reading("a")]);
	});

	test("a failed report is dropped and repeated on the next beat", async () => {
		const { reporter, timers, sent } = setup(true);
		reporter.set(reading("a"));
		timers.advance(300);
		await Promise.resolve();
		timers.advance(30_000);
		expect(sent).toEqual([reading("a"), reading("a")]);
	});

	test("stopping says the app is inactive, once, and then nothing more is sent", () => {
		const { reporter, timers, sent } = setup();
		reporter.set(reading("a"));
		timers.advance(300);
		reporter.stop();
		reporter.stop();
		reporter.set(reading("b"));
		timers.advance(60_000);
		expect(sent).toEqual([reading("a"), away]);
	});

	test("stopping an app that never said it was active sends nothing", () => {
		const { reporter, timers, sent } = setup();
		reporter.set(reading("a"));
		reporter.stop();
		timers.advance(60_000);
		expect(sent).toEqual([]);
	});
});
