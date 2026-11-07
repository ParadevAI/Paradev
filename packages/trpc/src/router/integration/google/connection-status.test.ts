import { describe, expect, test } from "bun:test";
import {
	type GoogleConnectionStatusRow,
	googleConnectionStatus,
	pickGoogleStatusConnection,
} from "./connection-status";

function row(
	id: string,
	disconnectedAt: Date | null = null,
): GoogleConnectionStatusRow {
	return {
		id,
		externalAccountId: `${id}@example.com`,
		connectedByUserId: "user-1",
		createdAt: new Date("2026-11-01T00:00:00Z"),
		disconnectedAt,
	};
}

const stale = new Date("2026-10-01T00:00:00Z");

describe("pickGoogleStatusConnection", () => {
	test("no rows is no connection", () => {
		expect(pickGoogleStatusConnection([])).toBeNull();
	});

	test("one row is that row", () => {
		expect(pickGoogleStatusConnection([row("a")])?.id).toBe("a");
	});

	test("two live rows pick the newest instead of failing", () => {
		expect(pickGoogleStatusConnection([row("new"), row("old")])?.id).toBe(
			"new",
		);
	});

	test("a live row wins over a newer disconnected one", () => {
		expect(
			pickGoogleStatusConnection([row("gone", stale), row("live")])?.id,
		).toBe("live");
	});

	test("only disconnected rows pick the newest of them", () => {
		expect(
			pickGoogleStatusConnection([row("b", stale), row("a", stale)])?.id,
		).toBe("b");
	});
});

describe("googleConnectionStatus", () => {
	test("null without rows", () => {
		expect(googleConnectionStatus([])).toBeNull();
	});

	test("a stale row beside a live one reads as connected", () => {
		const status = googleConnectionStatus([row("gone", stale), row("live")]);
		expect(status).toMatchObject({
			id: "live",
			email: "live@example.com",
			needsReconnect: false,
			accountCount: 2,
		});
	});

	test("only a disconnected row reads as needing reconnect", () => {
		expect(googleConnectionStatus([row("gone", stale)])).toMatchObject({
			needsReconnect: true,
			accountCount: 1,
		});
	});
});
