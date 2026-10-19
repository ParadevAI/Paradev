import { beforeEach, describe, expect, test } from "bun:test";
import { db } from "@superset/db/client";
import type { cloudWorkspaces } from "@superset/db/schema";
import { stub } from "../../../test/stub";
import * as realtime from "../../lib/realtime";
import * as sandbox from "../../lib/sandbox";
import * as meter from "./meter";
import { recordSessionEnded, wakeCloudWorkspace } from "./wake";

type Row = typeof cloudWorkspaces.$inferSelect;

const NOW = new Date("2026-10-18T12:00:00.000Z");
const LATER = new Date("2026-10-18T13:00:00.000Z");

let writes: Record<string, unknown>[];
let nudges: number;
let wokenEndsAt: Date | null;

stub(db, {
	update: () => ({
		set: (values: Record<string, unknown>) => {
			writes.push(values);
			return { where: async () => [] };
		},
	}),
});
stub(realtime, {
	nudge: () => {
		nudges++;
	},
});
stub(sandbox, {
	buildSandboxClaim: async () => ({ claim: {}, agentCredentialDigest: "d" }),
	wakeSandbox: async () => ({
		hostTarget: "https://box",
		booted: false,
		sessionEndsAt: wokenEndsAt,
	}),
});
stub(meter, { attachBootSession: async () => {} });

function row(fields: Partial<Row>): Row {
	return {
		id: "00000000-0000-0000-0000-000000000001",
		organizationId: "org",
		providerSandboxId: "ws-box",
		sandboxUrl: "https://box",
		bootAgentCredentialDigest: "d",
		sessionEndsAt: null,
		...fields,
	} as Row;
}

beforeEach(() => {
	writes = [];
	nudges = 0;
	wokenEndsAt = LATER;
});

describe("wakeCloudWorkspace", () => {
	test("records when the session now ends", async () => {
		await wakeCloudWorkspace(row({ sessionEndsAt: NOW }));
		expect(writes).toEqual([{ sessionEndsAt: LATER }]);
	});

	test("writes nothing when the session end did not move", async () => {
		await wakeCloudWorkspace(row({ sessionEndsAt: new Date(LATER) }));
		expect(writes).toEqual([]);
	});
});

describe("recordSessionEnded", () => {
	test("ends a session that had time left and tells clients", async () => {
		await recordSessionEnded(row({ sessionEndsAt: LATER }), NOW);
		expect(writes).toEqual([{ sessionEndsAt: NOW }]);
		expect(nudges).toBe(1);
	});

	test("leaves a session that already ended", async () => {
		await recordSessionEnded(row({ sessionEndsAt: new Date(NOW) }), LATER);
		expect(writes).toEqual([]);
		expect(nudges).toBe(0);
	});
});
