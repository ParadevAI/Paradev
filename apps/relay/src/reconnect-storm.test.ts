/// <reference types="bun" />
import { expect, test } from "bun:test";
import {
	type HostConnectRecord,
	RECONNECT_STORM_THRESHOLD,
	RECONNECT_STORM_WINDOW_MS,
	recordHostConnect,
} from "./reconnect-storm";

test("flags a host only when connects inside the window exceed the threshold", () => {
	let history: HostConnectRecord[] = [];
	const step = RECONNECT_STORM_WINDOW_MS / (RECONNECT_STORM_THRESHOLD + 1);
	const flags: boolean[] = [];
	for (let i = 0; i <= RECONNECT_STORM_THRESHOLD; i++) {
		const result = recordHostConnect(history, {
			at: i * step,
			colo: i % 2 ? "FRA" : "LAX",
		});
		history = result.history;
		flags.push(result.storm);
	}
	expect(flags.at(-1)).toBe(true);
	expect(flags.slice(0, -1).every((storm) => !storm)).toBe(true);

	const later = recordHostConnect(history, {
		at: RECONNECT_STORM_THRESHOLD * step + RECONNECT_STORM_WINDOW_MS,
		colo: "LAX",
	});
	expect(later.storm).toBe(false);
	expect(later.history).toHaveLength(1);
});
