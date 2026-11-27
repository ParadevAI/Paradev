import { describe, expect, test } from "bun:test";
import {
	createTelemetryStateChannel,
	type TelemetryState,
} from "./telemetry-state";

describe("createTelemetryStateChannel", () => {
	test("a new subscriber gets the current state first, then each change", () => {
		let current: TelemetryState = { enabled: false, doNotTrack: false };
		const channel = createTelemetryStateChannel(() => current);
		const seen: TelemetryState[] = [];

		const subscription = channel
			.observe()
			.subscribe({ next: (state) => seen.push(state) });
		current = { enabled: true, doNotTrack: false };
		channel.publish();
		subscription.unsubscribe();

		expect(seen).toEqual([
			{ enabled: false, doNotTrack: false },
			{ enabled: true, doNotTrack: false },
		]);
	});
});
