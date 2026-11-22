import { afterEach, expect, test } from "bun:test";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { readClaudeQuotaIdentity } from "./read-claude-quota-identity";

const directories: string[] = [];
afterEach(async () => {
	await Promise.all(
		directories
			.splice(0)
			.map((path) => rm(path, { recursive: true, force: true })),
	);
});
async function identity(accountUuid?: string, organizationUuid?: string) {
	const directory = await mkdtemp(join(tmpdir(), "quota-identity-"));
	directories.push(directory);
	await writeFile(
		join(directory, ".claude.json"),
		JSON.stringify({ oauthAccount: { accountUuid, organizationUuid } }),
	);
	return readClaudeQuotaIdentity(directory);
}
test("same account and organization have one identity across profiles", async () => {
	const first = await identity("user", "org");
	expect(first).not.toBeNull();
	expect(await identity("user", "org")).toBe(first);
	expect(await identity("user", "other-org")).not.toBe(first);
	expect(await identity("other-user", "org")).not.toBe(first);
});
test("missing or unreadable identity cannot merge accounts", async () => {
	expect(await identity("user")).toBeNull();
	expect(await identity(undefined, "org")).toBeNull();
	expect(
		await readClaudeQuotaIdentity("/nonexistent/quota-profile"),
	).toBeNull();
});
