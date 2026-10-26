import { Database } from "bun:sqlite";
import { afterEach, beforeEach, expect, test } from "bun:test";
import { drizzle } from "drizzle-orm/bun-sqlite";
import { sqliteTable, text } from "drizzle-orm/sqlite-core";
import { releaseRepositoryWhere } from "./releaseRepositoryWhere";

const repositories = sqliteTable("github_repositories", {
	id: text("id").notNull(),
	organizationId: text("organization_id").notNull(),
	fullName: text("full_name").notNull(),
});

let sqlite: Database;

beforeEach(() => {
	sqlite = new Database(":memory:");
	sqlite.exec(
		"CREATE TABLE github_repositories (id TEXT, organization_id TEXT, full_name TEXT)",
	);
});

afterEach(() => sqlite.close());

test("finds the connected release repository regardless of GitHub name casing", () => {
	const db = drizzle(sqlite);
	db.insert(repositories)
		.values({
			id: "connected",
			organizationId: "production-org",
			fullName: "ParadevAI/Paradev",
		})
		.run();

	expect(
		db
			.select({ id: repositories.id })
			.from(repositories)
			.where(releaseRepositoryWhere("production-org", "paradevai/paradev"))
			.all(),
	).toEqual([{ id: "connected" }]);
});

test("keeps organization scoping and treats repository names as literal strings", () => {
	const db = drizzle(sqlite);
	db.insert(repositories)
		.values([
			{
				id: "other-org",
				organizationId: "other-org",
				fullName: "Owner/My_Repo",
			},
			{
				id: "other-name",
				organizationId: "production-org",
				fullName: "Owner/MyXRepo",
			},
			{
				id: "connected",
				organizationId: "production-org",
				fullName: "Owner/My_Repo",
			},
		])
		.run();

	expect(
		db
			.select({ id: repositories.id })
			.from(repositories)
			.where(releaseRepositoryWhere("production-org", "owner/my_repo"))
			.all(),
	).toEqual([{ id: "connected" }]);
});
