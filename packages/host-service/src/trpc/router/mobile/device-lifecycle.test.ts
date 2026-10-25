import { describe, expect, test } from "bun:test";
import {
	createDeviceLifecycle,
	type DeviceRef,
	HOLD_TIMEOUT_MS,
	RELEASE_GRACE_MS,
} from "./device-lifecycle";

const iphone: DeviceRef = { platform: "ios", key: "UDID-1" };
const pixel: DeviceRef = { platform: "android", key: "Pixel_8" };

function setup(initialOwned: DeviceRef[] = []) {
	let time = 1_000;
	const owned = [...initialOwned];
	const shutDown: DeviceRef[] = [];
	let failShutdown = false;
	const lifecycle = createDeviceLifecycle<DeviceRef>({
		now: () => time,
		store: {
			list: () => [...owned],
			add: (device) => owned.push(device),
			remove: (device) => {
				const index = owned.findIndex(
					(d) => d.platform === device.platform && d.key === device.key,
				);
				if (index >= 0) owned.splice(index, 1);
			},
		},
		shutdown: async (device) => {
			if (failShutdown) throw new Error("hub unreachable");
			shutDown.push(device);
		},
	});
	return {
		lifecycle,
		owned,
		shutDown,
		advance: (ms: number) => {
			time += ms;
		},
		failShutdowns: () => {
			failShutdown = true;
		},
	};
}

describe("device lifecycle", () => {
	test("shuts down a device it booted once the grace after the last release passes", async () => {
		const { lifecycle, shutDown, owned, advance } = setup();
		lifecycle.claim(iphone);
		lifecycle.hold(iphone, "pane-a");
		await lifecycle.sweep([iphone]);
		lifecycle.release(iphone, "pane-a");

		advance(RELEASE_GRACE_MS.ios - 1);
		await lifecycle.sweep([iphone]);
		expect(shutDown).toEqual([]);

		advance(1);
		await lifecycle.sweep([iphone]);
		expect(shutDown).toEqual([iphone]);
		expect(owned).toEqual([]);
	});

	test("keeps a device when its pane comes back within the grace", async () => {
		const { lifecycle, shutDown, advance } = setup();
		lifecycle.claim(iphone);
		lifecycle.release(iphone, "pane-a");
		advance(RELEASE_GRACE_MS.ios / 2);
		lifecycle.hold(iphone, "pane-b");
		advance(RELEASE_GRACE_MS.ios);
		await lifecycle.sweep([iphone]);
		expect(shutDown).toEqual([]);
	});

	test("never shuts down a device it did not boot", async () => {
		const { lifecycle, shutDown, advance } = setup();
		lifecycle.hold(iphone, "pane-a");
		lifecycle.release(iphone, "pane-a");
		advance(HOLD_TIMEOUT_MS * 2);
		await lifecycle.sweep([iphone]);
		expect(shutDown).toEqual([]);
	});

	test("keeps a device while another pane still holds it", async () => {
		const { lifecycle, shutDown, advance } = setup();
		lifecycle.claim(pixel);
		lifecycle.hold(pixel, "pane-a");
		lifecycle.hold(pixel, "pane-b");
		lifecycle.release(pixel, "pane-a");
		advance(RELEASE_GRACE_MS.android + 1);
		await lifecycle.sweep([pixel]);
		expect(shutDown).toEqual([]);
	});

	test("drops a hold that stops being renewed", async () => {
		const { lifecycle, shutDown, advance } = setup();
		lifecycle.claim(iphone);
		lifecycle.hold(iphone, "pane-a");
		advance(HOLD_TIMEOUT_MS - 1);
		await lifecycle.sweep([iphone]);
		expect(shutDown).toEqual([]);

		advance(1);
		await lifecycle.sweep([iphone]);
		expect(shutDown).toEqual([iphone]);
	});

	test("forgets a device someone else shut down", async () => {
		const { lifecycle, shutDown, owned } = setup();
		lifecycle.claim(iphone);
		lifecycle.hold(iphone, "pane-a");
		await lifecycle.sweep([iphone]);
		await lifecycle.sweep([]);
		expect(owned).toEqual([]);
		expect(shutDown).toEqual([]);
	});

	test("keeps a device that is still booting", async () => {
		const { lifecycle, owned, advance } = setup();
		lifecycle.claim(pixel);
		lifecycle.hold(pixel, "pane-a");
		advance(HOLD_TIMEOUT_MS / 2);
		await lifecycle.sweep([]);
		expect(owned).toEqual([pixel]);
	});

	test("after a restart, shuts down what it booted before once no pane claims it", async () => {
		const { lifecycle, shutDown, advance } = setup([iphone]);
		advance(RELEASE_GRACE_MS.ios);
		await lifecycle.sweep([iphone]);
		expect(shutDown).toEqual([iphone]);
	});

	test("keeps tracking a device whose shutdown failed", async () => {
		const { lifecycle, owned, advance, failShutdowns } = setup([iphone]);
		failShutdowns();
		advance(RELEASE_GRACE_MS.ios);
		await lifecycle.sweep([iphone]);
		expect(owned).toEqual([iphone]);
	});
});
