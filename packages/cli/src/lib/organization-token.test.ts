import { afterAll, afterEach, describe, expect, mock, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const originalSupersetHomeDir = process.env.SUPERSET_HOME_DIR;
const tempHome = mkdtempSync(join(tmpdir(), "superset-cli-org-token-"));
process.env.SUPERSET_HOME_DIR = tempHome;

const { forgetOrganizationTokens, organizationBearer } = await import(
	"./organization-token"
);

afterAll(() => {
	if (originalSupersetHomeDir === undefined) {
		delete process.env.SUPERSET_HOME_DIR;
	} else {
		process.env.SUPERSET_HOME_DIR = originalSupersetHomeDir;
	}
	rmSync(tempHome, { recursive: true, force: true });
});

afterEach(() => forgetOrganizationTokens());

function jwt(claims: Record<string, unknown>): string {
	const part = (value: object) =>
		Buffer.from(JSON.stringify(value)).toString("base64url");
	return `${part({ alg: "none" })}.${part(claims)}.signature`;
}

const inAnHour = () => Math.floor(Date.now() / 1000) + 3600;

describe("organizationBearer", () => {
	test("exchanges the login once and reuses the token after", async () => {
		const login = jwt({ sub: "user-1" });
		const minted = jwt({ sub: "user-1", exp: inAnHour() });
		const fetchImpl = mock(async () => Response.json({ token: minted }));

		expect(await organizationBearer(login, "org-1", fetchImpl)).toBe(minted);
		expect(await organizationBearer(login, "org-1", fetchImpl)).toBe(minted);
		expect(fetchImpl).toHaveBeenCalledTimes(1);
	});

	test("doesn't reuse another user's token", async () => {
		const otherUsers = jwt({ sub: "user-2", exp: inAnHour() });
		await organizationBearer(
			jwt({ sub: "user-2" }),
			"org-1",
			mock(async () => Response.json({ token: otherUsers })),
		);
		const mine = jwt({ sub: "user-1", exp: inAnHour() });
		const fetchImpl = mock(async () => Response.json({ token: mine }));
		expect(
			await organizationBearer(jwt({ sub: "user-1" }), "org-1", fetchImpl),
		).toBe(mine);
	});

	test("keeps the login when the API can't exchange it", async () => {
		const login = jwt({ sub: "user-1" });
		const fetchImpl = mock(async () => new Response(null, { status: 401 }));
		expect(await organizationBearer(login, "org-1", fetchImpl)).toBe(login);
	});
});
