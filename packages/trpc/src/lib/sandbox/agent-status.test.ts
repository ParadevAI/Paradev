import { beforeEach, describe, expect, test } from "bun:test";
import { db } from "@superset/db/client";
import { stub } from "../../../test/stub";
import * as realtime from "../realtime";
import { sandboxHostSecretFor } from "./access";
import {
	reportSandboxAgentStatus,
	WORKING_KEEPALIVE_CAP_MS,
} from "./agent-status";

const WORKSPACE_ID = "11111111-2222-4333-8444-555555555555";
const NOW = 1_800_000_000_000;
const EXTENDED_TO = new Date(NOW + 60 * 60 * 1000);

type Row = {
	organizationId: string;
	status: string;
	providerSandboxId: string;
	agentStatus: string | null;
	agentStatusAt: Date | null;
	sessionEndsAt: Date | null;
};

let row: Row | undefined;
let writes: Array<Record<string, unknown>>;
let nudges: number;
let extended: string[];

stub(db.query.cloudWorkspaces, { findFirst: () => Promise.resolve(row) });
stub(db, {
	update: () => ({
		set: (values: Record<string, unknown>) => ({
			where: () => {
				writes.push(values);
				return Promise.resolve();
			},
		}),
	}),
});
stub(realtime, {
	nudge: () => {
		nudges += 1;
	},
});

const deps = {
	extend: (id: string) => {
		extended.push(id);
		return Promise.resolve(EXTENDED_TO);
	},
	now: () => NOW,
};

async function report(status: Row["agentStatus"], at = NOW) {
	return reportSandboxAgentStatus(
		{
			workspaceId: WORKSPACE_ID,
			presentedSecret: await sandboxHostSecretFor(WORKSPACE_ID),
			status: status as never,
			at,
		},
		deps,
	);
}

beforeEach(() => {
	row = {
		organizationId: "org",
		status: "ready",
		providerSandboxId: "sbx",
		agentStatus: null,
		agentStatusAt: null,
		sessionEndsAt: EXTENDED_TO,
	};
	writes = [];
	nudges = 0;
	extended = [];
});

describe("reportSandboxAgentStatus", () => {
	test("a working report extends the session", async () => {
		expect(await report("working")).toBe("ok");
		expect(extended).toEqual(["sbx"]);
	});

	test("an extension that moved the session end records it", async () => {
		row = {
			...(row as Row),
			agentStatus: "working",
			agentStatusAt: new Date(NOW - 60_000),
			sessionEndsAt: new Date(NOW + 60_000),
		};
		await report("working");
		expect(writes).toEqual([{ sessionEndsAt: EXTENDED_TO }]);
	});

	test("an agent waiting on a person, finished or gone does not extend", async () => {
		for (const status of ["permission", "review", "failed", null]) {
			await report(status);
		}
		expect(extended).toEqual([]);
	});

	test("a repeated status writes nothing and nudges nobody, and still extends", async () => {
		row = {
			...(row as Row),
			agentStatus: "working",
			agentStatusAt: new Date(NOW - 60_000),
		};
		await report("working", NOW);
		expect(writes).toEqual([]);
		expect(nudges).toBe(0);
		expect(extended).toEqual(["sbx"]);
	});

	test("a changed status is written with its timestamp and nudged", async () => {
		await report("working", NOW - 5);
		expect(writes).toEqual([
			{ agentStatus: "working", agentStatusAt: new Date(NOW - 5) },
		]);
		expect(nudges).toBe(1);
	});

	test("past the continuous-working cap the session is left to end", async () => {
		row = {
			...(row as Row),
			agentStatus: "working",
			agentStatusAt: new Date(NOW - WORKING_KEEPALIVE_CAP_MS - 1),
		};
		await report("working");
		expect(extended).toEqual([]);
	});

	test("a wrong secret is refused", async () => {
		const outcome = await reportSandboxAgentStatus(
			{
				workspaceId: WORKSPACE_ID,
				presentedSecret: "nope",
				status: "working",
				at: NOW,
			},
			deps,
		);
		expect(outcome).toBe("unauthorized");
		expect(extended).toEqual([]);
	});
});
