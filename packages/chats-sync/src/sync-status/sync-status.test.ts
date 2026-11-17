import { describe, expect, test } from "bun:test";
import {
	createSyncStatus,
	type SyncStatus,
	syncStatusLabel,
	syncStatusOf,
} from "./sync-status.ts";

/** Timers the test moves by hand. */
function fakeTimers() {
	let now = 0;
	let next = 1;
	const due = new Map<number, { at: number; fn: () => void }>();
	return {
		timers: {
			setTimeout: (fn: () => void, ms: number) => {
				const id = next++;
				due.set(id, { at: now + ms, fn });
				return id;
			},
			clearTimeout: (id: unknown) => void due.delete(id as number),
		},
		advance(ms: number) {
			now += ms;
			for (const [id, t] of [...due].sort((a, b) => a[1].at - b[1].at)) {
				if (t.at > now) continue;
				due.delete(id);
				t.fn();
			}
		},
	};
}

function setup(initial?: Parameters<typeof createSyncStatus>[0]["initial"]) {
	const clock = fakeTimers();
	const seen: SyncStatus[] = [];
	const status = createSyncStatus({
		onChange: (s) => seen.push(s),
		initial,
		delayMs: 1000,
		timers: clock.timers,
	});
	return { clock, seen, status };
}

describe("syncStatusOf", () => {
	test("a channel down or being checked is connecting, a bootstrap on its way is updating", () => {
		expect(
			syncStatusOf({
				connection: "connected",
				checking: false,
				catchingUp: false,
			}),
		).toBe("live");
		expect(
			syncStatusOf({
				connection: "reconnecting",
				checking: false,
				catchingUp: true,
			}),
		).toBe("connecting");
		expect(
			syncStatusOf({
				connection: "connecting",
				checking: false,
				catchingUp: false,
			}),
		).toBe("connecting");
		expect(
			syncStatusOf({
				connection: "connected",
				checking: true,
				catchingUp: false,
			}),
		).toBe("connecting");
		expect(
			syncStatusOf({
				connection: "connected",
				checking: false,
				catchingUp: true,
			}),
		).toBe("updating");
	});

	test("labels", () => {
		expect(syncStatusLabel("connecting")).toBe("Connecting…");
		expect(syncStatusLabel("updating")).toBe("Updating…");
		expect(syncStatusLabel("live")).toBeNull();
	});
});

describe("createSyncStatus", () => {
	test("a blip shorter than the delay never shows", () => {
		const { clock, seen, status } = setup();
		status.set({ checking: true });
		clock.advance(400);
		status.set({ checking: false });
		clock.advance(2000);
		expect(seen).toEqual([]);
		expect(status.get()).toBe("live");
	});

	test("a long reconnect shows connecting, then updating while the bootstrap catches up, then live at once", () => {
		const { clock, seen, status } = setup();
		status.set({ connection: "reconnecting" });
		clock.advance(999);
		expect(seen).toEqual([]);
		clock.advance(1);
		expect(seen).toEqual(["connecting"]);
		// The channel is back but its gap was too old to replay: the bootstrap starts in the same breath.
		status.set({ catchingUp: true, connection: "connected" });
		expect(seen).toEqual(["connecting", "updating"]);
		status.set({ catchingUp: false });
		expect(seen).toEqual(["connecting", "updating", "live"]);
	});

	test("it shows what's true when the delay ends, not what started it", () => {
		const { clock, seen, status } = setup();
		status.set({ checking: true });
		clock.advance(500);
		status.set({ checking: false, catchingUp: true });
		clock.advance(500);
		expect(seen).toEqual(["updating"]);
	});

	test("starts from its conditions: a launch over a cached state reads connecting after the delay", () => {
		const { clock, seen, status } = setup({
			connection: "connecting",
			catchingUp: true,
		});
		expect(status.get()).toBe("live");
		clock.advance(1000);
		expect(seen).toEqual(["connecting"]);
	});

	test("stopped, it says nothing more", () => {
		const { clock, seen, status } = setup();
		status.set({ connection: "reconnecting" });
		status.stop();
		clock.advance(5000);
		status.set({ connection: "connected" });
		expect(seen).toEqual([]);
	});
});
