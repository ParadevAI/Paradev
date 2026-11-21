import { describe, expect, test } from "bun:test";
import type { PageViewportZoom } from "@superset/shared/page-zoom";
import { createViewportZoomForward } from "./viewport-zoom-forward";

const viewport = { scale: 2, x: 0, y: 0, width: 100, height: 100 };
const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

function fakeGuest(results: unknown[]) {
	const queue = [...results];
	const guest = {
		calls: 0,
		seen: [] as PageViewportZoom[],
		runScript: () => {
			guest.calls++;
			return queue.length
				? Promise.resolve(queue.shift())
				: new Promise<never>(() => {});
		},
	};
	return guest;
}

describe("createViewportZoomForward", () => {
	test("forwards each viewport and waits for the next", async () => {
		const guest = fakeGuest([viewport]);
		createViewportZoomForward({
			runScript: guest.runScript,
			onViewport: (v) => guest.seen.push(v),
		}).rearm();
		await settle();
		expect(guest.seen).toEqual([viewport]);
		expect(guest.calls).toBe(2);
	});

	test("stops on a non-viewport result instead of spinning", async () => {
		const zonePromise = {
			__zone_symbol__state: null,
			__zone_symbol__value: [],
		};
		const guest = fakeGuest([zonePromise, zonePromise, zonePromise]);
		createViewportZoomForward({
			runScript: guest.runScript,
			onViewport: (v) => guest.seen.push(v),
		}).rearm();
		await settle();
		expect(guest.calls).toBe(1);
		expect(guest.seen).toEqual([]);
	});

	test("drops a result that arrives after cancel", async () => {
		let resolve: (value: unknown) => void = () => {};
		const seen: PageViewportZoom[] = [];
		const forward = createViewportZoomForward({
			runScript: () => new Promise((r) => (resolve = r)),
			onViewport: (v) => seen.push(v),
		});
		forward.rearm();
		forward.cancel();
		resolve(viewport);
		await settle();
		expect(seen).toEqual([]);
	});
});
