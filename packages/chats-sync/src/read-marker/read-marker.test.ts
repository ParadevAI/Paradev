import { describe, expect, test } from "bun:test";
import { type ChatState, myRead } from "@superset/chats-core";
import { applyEvent } from "../apply-event/apply-event.ts";
import { fromBootstrap } from "../from-api/from-api.ts";
import {
	apiMessage,
	bootstrap,
	PRIYA,
} from "../test-fixtures/test-fixtures.ts";
import { createReadMarker } from "./read-marker.ts";

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
	let state: ChatState = fromBootstrap(
		bootstrap({
			messages: [
				apiMessage({
					id: "p1",
					groupId: "g-trip",
					authorId: PRIYA.id,
					at: "2026-10-10T09:00:00.000Z",
				}),
			],
		}),
	);
	const timers = fakeTimers();
	const sent: [string, string][] = [];
	const marker = createReadMarker({
		send: async (groupId, messageId) => {
			sent.push([groupId, messageId]);
			return { read: null };
		},
		getState: () => state,
		update: (change) => (state = change(state)),
		now: () => new Date("2026-10-10T09:10:00.000Z"),
		timers,
	});
	const arrive = (id: string, at: string) => {
		state = applyEvent(state, {
			type: "message.created",
			message: apiMessage({ id, groupId: "g-trip", authorId: PRIYA.id, at }),
			task: null,
		});
		marker.changed();
	};
	return { marker, timers, sent, state: () => state, arrive };
}

describe("createReadMarker", () => {
	test("the chat on screen is read up to its newest message a second after it's shown, at once on screen", () => {
		const { marker, timers, sent, state } = setup();
		marker.view({ active: true, groupId: "g-trip" });
		timers.advance(999);
		expect(sent).toEqual([]);
		timers.advance(1);
		expect(sent).toEqual([["g-trip", "p1"]]);
		expect(myRead(state(), "g-trip")).toMatchObject({
			messageId: "p1",
			messageAt: "2026-10-10T09:00:00.000Z",
			at: "2026-10-10T09:10:00.000Z",
		});
		// Read already: nothing more to send.
		marker.view({ active: true, groupId: "g-me" });
		marker.view({ active: true, groupId: "g-trip" });
		timers.advance(1000);
		expect(sent).toEqual([["g-trip", "p1"]]);
	});

	test("marked up to a message, a chat that isn't on screen is read that far at once; a later message stays unread", () => {
		const { marker, sent, state, arrive } = setup();
		arrive("p2", "2026-10-10T09:05:00.000Z");
		marker.markUpTo("g-trip", "p1");
		expect(sent).toEqual([["g-trip", "p1"]]);
		expect(myRead(state(), "g-trip")).toMatchObject({
			messageId: "p1",
			messageAt: "2026-10-10T09:00:00.000Z",
		});
		marker.markUpTo("g-trip", "gone");
		expect(sent).toEqual([["g-trip", "p1"]]);
	});

	test("new messages are read once a burst settles; nothing is read while the app isn't in use", () => {
		const { marker, timers, sent, arrive } = setup();
		marker.view({ active: false, groupId: null });
		arrive("p2", "2026-10-10T09:01:00.000Z");
		timers.advance(5000);
		expect(sent).toEqual([]);
		marker.view({ active: true, groupId: "g-trip" });
		arrive("p3", "2026-10-10T09:02:00.000Z");
		timers.advance(500);
		arrive("p4", "2026-10-10T09:03:00.000Z");
		timers.advance(500);
		expect(sent).toEqual([["g-trip", "p4"]]);
	});

	test("stopped, it reads nothing until told where the person is again", () => {
		const { marker, timers, sent, arrive } = setup();
		marker.view({ active: true, groupId: "g-trip" });
		marker.stop();
		arrive("p2", "2026-10-10T09:01:00.000Z");
		timers.advance(1000);
		expect(sent).toEqual([]);
		marker.view({ active: true, groupId: "g-trip" });
		timers.advance(1000);
		expect(sent).toEqual([["g-trip", "p2"]]);
	});
});
