import { beforeEach, expect, test } from "bun:test";
import { db } from "@superset/db/client";
import type { SQL } from "drizzle-orm";
import { PgDialect } from "drizzle-orm/pg-core";
import { stub } from "../../../../test/stub";

const ORG = "00000000-0000-4000-8000-000000000001";
const acme = { id: "installation-acme", installationId: "1" };
const globex = { id: "installation-globex", installationId: "2" };
const repositories = [
	{ id: "repo-widgets", fullName: "acme/widgets", installation: acme },
	{ id: "repo-gadgets", fullName: "globex/gadgets", installation: globex },
];

let installed: typeof repositories = [];
let hasInstallation = true;
const repositoryLookups: SQL[] = [];

stub(db.query.githubRepositories, {
	findFirst: async ({ where }: { where: SQL }) => {
		repositoryLookups.push(where);
		return installed.shift();
	},
});
stub(db.query.githubInstallations, {
	findFirst: async () => (hasInstallation ? { id: acme.id } : undefined),
});

const { findInstalledRepository } = await import("./find-installed-repository");

beforeEach(() => {
	installed = [];
	hasInstallation = true;
	repositoryLookups.length = 0;
});

test("a repository resolves to the installation of the GitHub account that owns it", async () => {
	installed = [repositories[1]];
	expect(await findInstalledRepository(ORG, "Globex/Gadgets")).toEqual({
		installation: globex,
		repo: { id: "repo-gadgets", fullName: "globex/gadgets" },
	});
});

test("the lookup is scoped to the organization and matches the name case-insensitively", async () => {
	installed = [repositories[1]];
	await findInstalledRepository(ORG, "Globex/Gadgets");
	const [where] = repositoryLookups;
	if (!where) throw new Error("no repository lookup");
	const { sql, params } = new PgDialect({ casing: "snake_case" }).sqlToQuery(
		where,
	);
	expect(sql).toBe(
		'("github_repositories"."organization_id" = $1 and lower("github_repositories"."full_name") = $2)',
	);
	expect(params).toEqual([ORG, "globex/gadgets"]);
});

test("a repository no installation covers is NOT_FOUND while one is connected", async () => {
	installed = [];
	await expect(
		findInstalledRepository(ORG, "initech/tps"),
	).rejects.toMatchObject({ code: "NOT_FOUND" });
});

test("without any installation the caller is asked to connect GitHub", async () => {
	installed = [];
	hasInstallation = false;
	await expect(
		findInstalledRepository(ORG, "initech/tps"),
	).rejects.toMatchObject({ code: "PRECONDITION_FAILED" });
});
