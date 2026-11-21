import { beforeAll, expect, test } from "bun:test";
import { inArray } from "drizzle-orm";
import {
	CHECKOUT,
	MAYA,
	ORG,
	seedCloudUsage,
} from "../test/cloud-usage-fixture";
import { cloudWorkspaceBoots, openBoot } from "./schema";

let db: Awaited<ReturnType<typeof seedCloudUsage>>;

beforeAll(async () => {
	db = await seedCloudUsage();
});

test("the open set has every boot with usage to finalize or a lock to give back, and no closed boot", async () => {
	const stoppedAt = new Date("2026-11-20T10:00:00Z");
	const boot = (
		id: string,
		state: {
			stoppedAt: Date | null;
			finalizedThrough: Date | null;
			lockOpen: boolean;
		},
	) => ({
		id,
		organizationId: ORG,
		cloudWorkspaceId: CHECKOUT,
		createdByUserId: MAYA,
		vcpus: 4,
		memoryMb: 8192,
		startedAt: new Date("2026-11-20T09:00:00Z"),
		...state,
	});
	const ids = ["open_running", "open_unbilled", "open_lock", "closed"];
	await db.insert(cloudWorkspaceBoots).values([
		boot("open_running", {
			stoppedAt: null,
			finalizedThrough: null,
			lockOpen: true,
		}),
		boot("open_unbilled", {
			stoppedAt,
			finalizedThrough: new Date("2026-11-20T09:30:00Z"),
			lockOpen: false,
		}),
		boot("open_lock", {
			stoppedAt,
			finalizedThrough: stoppedAt,
			lockOpen: true,
		}),
		boot("closed", { stoppedAt, finalizedThrough: stoppedAt, lockOpen: false }),
	]);
	try {
		const open = await db
			.select({ id: cloudWorkspaceBoots.id })
			.from(cloudWorkspaceBoots)
			.where(openBoot(cloudWorkspaceBoots));
		const ours = open.map((row) => row.id).filter((id) => ids.includes(id));
		expect(ours.sort()).toEqual(["open_lock", "open_running", "open_unbilled"]);
	} finally {
		await db
			.delete(cloudWorkspaceBoots)
			.where(inArray(cloudWorkspaceBoots.id, ids));
	}
});
