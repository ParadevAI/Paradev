import { beforeAll, expect, test } from "bun:test";
import type { CloudUsage } from "@superset/auth/billing";
import { ADA, MAYA, ORG, SAM, seedCloudUsage } from "@superset/db/testing";
import { organizationCloudUsage } from "./billing";

let database: Awaited<ReturnType<typeof seedCloudUsage>>;

beforeAll(async () => {
	database = await seedCloudUsage();
});

const VALUE = { usedGbMinutes: 60 } as CloudUsage;

const read = (userId: string) =>
	organizationCloudUsage(
		{
			session: { user: { id: userId } },
			activeOrganizationId: ORG,
		} as never,
		{ database, billing: async () => ({ cloudUsage: VALUE }), enabled: true },
	);

test.each([
	["an owner", MAYA],
	["an admin", ADA],
])("%s gets the organization's cloud usage", async (_, userId) => {
	expect(await read(userId)).toBe(VALUE);
});

test("a member gets none of the organization's cloud usage", async () => {
	expect(await read(SAM)).toBeNull();
});
