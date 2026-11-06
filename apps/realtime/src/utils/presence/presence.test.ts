import { describe, expect, it } from "bun:test";
import type { PagePresenceViewer } from "@superset/shared/page-presence";
import { presenceMessage, SILENT_MS, sweepSilent } from "./presence";

const viewer = (id: string, guest = false): PagePresenceViewer => ({
	id,
	key: id,
	name: id,
	image: null,
	guest,
	guestNumber: null,
	color: 0,
});

const present = [
	{ userId: "ana", viewer: viewer("ana") },
	{ userId: "guest:1", viewer: viewer("guest:1", true) },
];
const visits = [
	{ userId: "ana", name: "Ana", image: null, lastSeenAt: 2 },
	{ userId: "ben", name: "Ben", image: null, lastSeenAt: 1 },
];

describe("presenceMessage", () => {
	it("leaves out the receiver and marks who is here now", () => {
		expect(
			presenceMessage({ userId: "ana", seesVisitors: true }, present, visits),
		).toEqual({
			type: "presence",
			viewers: [viewer("guest:1", true)],
			visitors: [
				{ ...visits[0], active: true },
				{ ...visits[1], active: false },
			],
		});
	});

	it("tells a receiver who may not see visitors only who is here", () => {
		expect(
			presenceMessage(
				{ userId: "guest:1", seesVisitors: false },
				present,
				visits,
			),
		).toEqual({ type: "presence", viewers: [viewer("ana")] });
	});
});

describe("sweepSilent", () => {
	it("closes sockets silent for too long and counts the rest", () => {
		const closed: string[] = [];
		const socket = (
			id: string,
			heardAt: number | null,
			connectedAt: number,
		) => ({
			connection: { close: () => closed.push(id) },
			connectedAt,
			heardAt: heardAt === null ? null : new Date(heardAt),
		});
		const now = 1_000_000;
		const result = sweepSilent(
			[
				socket("pinged", now - 1_000, 0),
				socket("silent", now - SILENT_MS - 1, 0),
				socket("new", null, now - 1_000),
				socket("never-pinged", null, now - SILENT_MS - 1),
			],
			now,
		);
		expect(closed).toEqual(["silent", "never-pinged"]);
		expect(result).toEqual({ evicted: true, remaining: 2 });
	});
});
