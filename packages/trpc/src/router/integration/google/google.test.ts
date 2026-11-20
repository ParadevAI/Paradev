import { describe, expect, test } from "bun:test";
import type { SelectConnection } from "@superset/db/schema";
import { summarizeGoogleConnections } from "./state";

describe("summarizeGoogleConnections", () => {
	test("reports a member with two Google accounts as connected", () => {
		const row = (id: string, email: string, disconnectedAt: Date | null) =>
			({
				id,
				externalAccountId: email,
				disconnectedAt,
				connectedByUserId: "user-1",
				createdAt: new Date(0),
			}) as unknown as SelectConnection;
		const summary = summarizeGoogleConnections([
			row("stale", "old@example.com", new Date(1)),
			row("work", "work@example.com", null),
			row("home", "home@example.com", null),
		]);
		expect(summary).toMatchObject({
			id: "work",
			email: "work@example.com",
			emails: ["work@example.com", "home@example.com"],
			needsReconnect: false,
		});
	});
});
