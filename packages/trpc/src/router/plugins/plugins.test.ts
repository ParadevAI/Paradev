import { beforeEach, describe, expect, test } from "bun:test";
import { db } from "@superset/db/client";
import { connections, members, pluginInstalls } from "@superset/db/schema";
import type { SQL } from "drizzle-orm";
import { PgDialect } from "drizzle-orm/pg-core";
import { stub } from "../../../test/stub";
import { posthog } from "../../lib/analytics";
import * as pluginConnections from "./connections";
import * as proxy from "./proxy";

interface InstallRow {
	id: string;
	userId: string;
	marketplace: string;
	pluginName: string;
	manifest: unknown;
	organizationId?: string;
	policy?: Record<string, string>;
}

interface ConnectionRow {
	id: string;
	connector: string;
	connectedByUserId: string;
	organizationId: string;
	disconnectedAt: Date | null;
}

const USER_ID = "user-1";
const ORG = "org-1";
const OTHER_ORG = "org-2";
const ORGS = [ORG, OTHER_ORG];
const dialect = new PgDialect();
const bound = (condition: SQL) => dialect.sqlToQuery(condition).params;
/** A row stays in reach unless the condition names an organization other than its own. */
const inReach = (values: unknown[], organizationId: string | undefined) => {
	const named = values.filter((value) => ORGS.includes(value as string));
	return !named.length || named.includes(organizationId);
};

let installs: InstallRow[] = [];
let live: ConnectionRow[] = [];
let forgotten: string[] = [];

const rows = <T>(value: T[]) =>
	Object.assign(Promise.resolve(value), {
		limit: () => Promise.resolve(value),
		orderBy: () => Promise.resolve(value),
	});

stub(posthog, { capture: () => {} });
stub(proxy, { forgetUpstreamTools: (id: string) => forgotten.push(id) });

stub(pluginConnections, {
	installRecord: (
		_userId: string,
		organizationId: string | null,
		pluginName: string,
	) => {
		const row = installs.find(
			(entry) =>
				entry.pluginName === pluginName &&
				(!entry.organizationId || entry.organizationId === organizationId),
		);
		return Promise.resolve(row && { id: row.id, marketplace: row.marketplace });
	},
});

stub(db, {
	select: () => ({
		from: (table: unknown) => ({
			leftJoin() {
				return this;
			},
			where: (condition: SQL) => {
				if (table === members) return rows([{ role: "member" }]);
				if (table === connections) {
					const values = bound(condition);
					return rows(
						live
							.filter(
								(row) =>
									row.connectedByUserId === USER_ID &&
									row.disconnectedAt === null &&
									inReach(values, row.organizationId),
							)
							.map((row) => ({
								id: row.id,
								connector: row.connector,
								account: null,
								user: "me@superset.sh",
							})),
					);
				}
				if (table !== pluginInstalls) return rows([]);
				const values = bound(condition);
				return rows(
					installs.filter(
						(row) => values.includes(row.id) || values.includes(row.userId),
					),
				);
			},
		}),
	}),
	delete: () => ({
		where: (condition: SQL) => {
			const values = bound(condition);
			installs = installs.filter((row) => !values.includes(row.id));
			return Promise.resolve();
		},
	}),
	update: () => ({
		set: () => ({
			where: (condition: SQL) => ({
				returning: () => {
					const values = bound(condition);
					const hit = live.filter(
						(row) =>
							row.disconnectedAt === null &&
							(values.includes(row.id) || values.includes(row.connector)) &&
							values.includes(row.connectedByUserId) &&
							inReach(values, row.organizationId),
					);
					for (const row of hit) row.disconnectedAt = new Date();
					return Promise.resolve(hit.map((row) => ({ id: row.id })));
				},
			}),
		}),
	}),
});

const { pluginsRouter } = await import("./plugins");
const { createCallerFactory, createTRPCContext, createTRPCRouter } =
	await import("../../trpc");

const callerFor = (
	sandboxCaller: {
		workspaceId: string;
		organizationId: string;
		userId: string;
	} | null,
) =>
	createCallerFactory(createTRPCRouter({ plugins: pluginsRouter }))(
		createTRPCContext({
			session: {
				user: { id: USER_ID, email: "me@superset.sh" },
				session: { activeOrganizationId: ORG },
			} as never,
			auth: {} as never,
			headers: new Headers(),
			sandboxCaller,
		}),
	);
const caller = callerFor(null);
const box = callerFor({
	workspaceId: "box",
	organizationId: ORG,
	userId: USER_ID,
});

const install = (overrides: Partial<InstallRow> = {}): InstallRow => ({
	id: "install-notion",
	userId: USER_ID,
	marketplace: "superset",
	pluginName: "notion",
	manifest: {
		name: "notion",
		version: "1.0.2",
		extensions: { superset: { connector: { slug: "notion" } } },
	},
	...overrides,
});

const connection = (
	id: string,
	connector: string,
	connectedByUserId = USER_ID,
	organizationId = ORG,
): ConnectionRow => ({
	id,
	connector,
	connectedByUserId,
	organizationId,
	disconnectedAt: null,
});

beforeEach(() => {
	installs = [];
	live = [];
	forgotten = [];
});

describe("plugins.uninstall", () => {
	test("disconnects the connector the published manifest names, not the stored one", async () => {
		installs = [install()];
		live = [
			connection("conn-mcp", "notion_mcp"),
			connection("conn-api", "notion"),
		];

		const result = await caller.plugins.uninstall({ name: "notion" });

		expect(result.disconnected).toBe(1);
		expect(live.find((row) => row.id === "conn-mcp")?.disconnectedAt).not.toBe(
			null,
		);
		expect(live.find((row) => row.id === "conn-api")?.disconnectedAt).toBe(
			null,
		);
		expect(forgotten).toEqual(["conn-mcp"]);
	});

	test("leaves the connector alone while another install still claims it", async () => {
		installs = [
			install(),
			install({
				id: "install-notes-acme",
				marketplace: "acme",
				pluginName: "notes",
				manifest: {
					name: "notes",
					version: "9.9.9",
					extensions: { superset: { connector: { slug: "notion_mcp" } } },
				},
			}),
		];
		live = [connection("conn-mcp", "notion_mcp")];

		const result = await caller.plugins.uninstall({ name: "notion" });

		expect(result.disconnected).toBe(0);
		expect(live[0]?.disconnectedAt).toBe(null);
	});

	test("another member's connection is untouched", async () => {
		installs = [install()];
		live = [connection("conn-theirs", "notion_mcp", "user-2")];

		const result = await caller.plugins.uninstall({ name: "notion" });

		expect(result.disconnected).toBe(0);
		expect(live[0]?.disconnectedAt).toBe(null);
	});
});

describe("plugins.uninstall of an organization install", () => {
	test("is refused when the organization installs it for the member's role", async () => {
		installs = [
			install({ organizationId: ORG, policy: { member: "installed" } }),
		];

		await expect(caller.plugins.uninstall({ name: "notion" })).rejects.toThrow(
			/cannot be uninstalled/,
		);
		expect(installs).toHaveLength(1);
	});
});

describe("plugins.list", () => {
	test("a connection without an install shows on its plugin's card, not a second card", async () => {
		live = [connection("conn-mcp", "notion_mcp")];

		const plugins = await caller.plugins.list();
		const notion = plugins.filter(
			(plugin) => plugin.connector === "notion_mcp",
		);

		expect(plugins.map((plugin) => plugin.name)).not.toContain("notion_mcp");
		expect(notion).toHaveLength(1);
		expect(notion[0]?.accounts).toEqual(["me@superset.sh"]);
	});

	test("a connection another install claims stays on that install only", async () => {
		installs = [
			install({
				id: "install-notes-acme",
				marketplace: "acme",
				pluginName: "notes",
				manifest: {
					name: "notes",
					version: "9.9.9",
					extensions: { superset: { connector: { slug: "notion_mcp" } } },
				},
			}),
		];
		live = [connection("conn-mcp", "notion_mcp")];

		const plugins = await caller.plugins.list();
		const holders = plugins.filter((plugin) =>
			plugin.connections.some((held) => held.id === "conn-mcp"),
		);

		expect(
			holders.map((plugin) => `${plugin.marketplace}/${plugin.name}`),
		).toEqual(["acme/notes"]);
	});

	test("a first-party install does not hide the shared connection from its sibling plugin", async () => {
		installs = [
			install({
				id: "install-gmail",
				pluginName: "gmail",
				manifest: {
					name: "gmail",
					version: "1.0.0",
					extensions: { superset: { connector: { slug: "google" } } },
				},
			}),
		];
		live = [connection("conn-google", "google")];

		const plugins = await caller.plugins.list();
		const calendar = plugins.find(
			(plugin) => plugin.name === "google-calendar",
		);

		expect(calendar?.connections.map((held) => held.id)).toEqual([
			"conn-google",
		]);
	});
});

describe("a cloud workspace acts in its own organization", () => {
	const theirs = "00000000-0000-4000-8000-00000000000b";

	test("cannot disconnect its creator's connection in another organization", async () => {
		live = [connection(theirs, "notion_mcp", USER_ID, OTHER_ORG)];

		await expect(
			box.plugins.connections.disconnect({ connectionId: theirs }),
		).rejects.toThrow(/Connection not found/);
		expect(live[0]?.disconnectedAt).toBe(null);
	});

	test("does not list its creator's connections in another organization", async () => {
		live = [
			connection("conn-here", "notion_mcp"),
			connection("conn-there", "linear", USER_ID, OTHER_ORG),
		];

		const listed = await box.plugins.connections.list();

		expect(listed.map((row) => row.id)).toEqual(["conn-here"]);
	});

	test("cannot disable its creator's install from another organization", async () => {
		installs = [
			install({ organizationId: OTHER_ORG, marketplace: `org:${OTHER_ORG}` }),
		];

		await expect(
			box.plugins.setEnabled({ name: "notion", enabled: false }),
		).rejects.toThrow(/not installed/);
	});
});
