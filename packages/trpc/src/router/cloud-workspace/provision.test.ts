import { beforeEach, expect, test } from "bun:test";
import { db } from "@superset/db/client";
import type { SQL } from "drizzle-orm";
import { PgDialect } from "drizzle-orm/pg-core";
import { stub } from "../../../test/stub";
import * as moves from "../../lib/moves";
import * as realtime from "../../lib/realtime";
import * as sandbox from "../../lib/sandbox";
import * as meter from "./meter";
import { provisionCloudWorkspace } from "./provision";

type Row = {
	id: string;
	organizationId: string;
	createdByUserId: string;
	name: string;
	status: string;
	providerSandboxId: string;
	sandboxUrl: string | null;
};

const WORKSPACE_ID = "0b8f4c1e-2a3d-4e5f-8a9b-1c2d3e4f5a6b";
const dialect = new PgDialect();

let row: Row;
let whileTheBoxIsMade: () => void;
let boxFails: boolean;
let teardowns: string[];
let moveOps: string[];

function holdsFor(target: Row, condition: SQL): boolean {
	const { sql, params } = dialect.sqlToQuery(condition);
	return [...sql.matchAll(/"(\w+)" (?:=|in) \(?([$\d, ]+)/g)].every(
		([, column = "", refs = ""]) => {
			const field = column.replace(/_(\w)/g, (_, c: string) =>
				c.toUpperCase(),
			) as keyof Row;
			return (refs.match(/\d+/g) ?? []).some(
				(ref) => params[Number(ref) - 1] === target[field],
			);
		},
	);
}

stub(db.query.cloudWorkspaces, { findFirst: async () => ({ ...row }) });
stub(db, {
	update: () => ({
		set: (values: Partial<Row>) => ({
			where: (condition: SQL) => ({
				returning: async () => {
					if (!holdsFor(row, condition)) return [];
					row = { ...row, ...values };
					return [{ id: row.id }];
				},
			}),
		}),
	}),
});
stub(sandbox, {
	buildSandboxClaim: async () => ({
		claim: { vcpus: 2 },
		environment: {},
		agentCredentialDigest: "digest",
	}),
	provisionSandbox: async ({ name }: { name: string }) => {
		whileTheBoxIsMade();
		if (boxFails) throw new Error("provider refused the box");
		return {
			providerSandboxId: name,
			sandboxUrl: `https://${name}.example`,
			hostTarget: `https://${name}.example`,
		};
	},
	settleSandbox: async () => ({}),
	recordBootSpans: () => {},
	deleteSandbox: async (id: string) => {
		teardowns.push(`delete:${id}`);
	},
	stopSandbox: async (id: string) => {
		teardowns.push(`stop:${id}`);
	},
});
stub(meter, {
	authorizeBoot: async () => ({ bootId: "boot-1" }),
	attachBootSession: async () => {},
	releaseBoot: async () => {},
});
stub(realtime, { nudge: () => {} });
stub(moves, {
	callMoves: async (_organizationId: string, request: { op: string }) => {
		moveOps.push(request.op);
		return { ids: [] };
	},
});

const restoredWithANewBox = () => {
	row = { ...row, status: "provisioning", providerSandboxId: "box-2" };
};

beforeEach(() => {
	row = {
		id: WORKSPACE_ID,
		organizationId: "org-1",
		createdByUserId: "user-1",
		name: "Cloud workspace",
		status: "provisioning",
		providerSandboxId: "box-1",
		sandboxUrl: null,
	};
	whileTheBoxIsMade = () => {};
	boxFails = false;
	teardowns = [];
	moveOps = [];
});

test("an older job that finishes its box after a restore leaves the new box on the row and deletes its own", async () => {
	whileTheBoxIsMade = restoredWithANewBox;

	await provisionCloudWorkspace({ cloudWorkspaceId: WORKSPACE_ID });

	expect(row.status).toBe("provisioning");
	expect(row.providerSandboxId).toBe("box-2");
	expect(teardowns).toEqual(["delete:box-1"]);
});

test("an older job whose box fails after a restore does not fail the restored workspace", async () => {
	whileTheBoxIsMade = restoredWithANewBox;
	boxFails = true;

	await provisionCloudWorkspace({ cloudWorkspaceId: WORKSPACE_ID });

	expect(row.status).toBe("provisioning");
	expect(row.providerSandboxId).toBe("box-2");
	expect(moveOps).toEqual([]);
});

test("a job whose box fails fails the chat moves into its workspace", async () => {
	boxFails = true;

	await provisionCloudWorkspace({ cloudWorkspaceId: WORKSPACE_ID });

	expect(row.status).toBe("failed");
	expect(moveOps).toEqual(["failInto"]);
});

test("a job left alone makes its box the ready workspace", async () => {
	expect(
		await provisionCloudWorkspace({ cloudWorkspaceId: WORKSPACE_ID }),
	).toBe("provisioned");

	expect(row.status).toBe("ready");
	expect(row.providerSandboxId).toBe("box-1");
	expect(teardowns).toEqual([]);
});
