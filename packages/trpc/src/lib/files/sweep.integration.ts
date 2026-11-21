import { afterAll, beforeAll, describe, expect, mock, test } from "bun:test";

const objectStore = new Set<string>();
mock.module("../r2", () => ({
	deleteObjects: async (keys: string[]) => {
		for (const key of keys) objectStore.delete(key);
	},
}));

const { db, dbWs } = await import("@superset/db/client");
const { attachments, files, organizations } = await import(
	"@superset/db/schema"
);
const { fileOriginalKey } = await import("@superset/shared/usercontent");
const { eq, inArray } = await import("drizzle-orm");
const { sweepOrphanFiles } = await import("./sweep");

const ORG = crypto.randomUUID();
const HOUR = 60 * 60 * 1000;
const now = Date.now();

const insertFile = async ({
	status,
	updatedAt,
}: {
	status: "pending" | "ready";
	updatedAt: number;
}) => {
	const id = crypto.randomUUID();
	await db.insert(files).values({
		id,
		organizationId: ORG,
		name: "screenshot.png",
		contentType: "image/png",
		sizeBytes: 4,
		sha256: "ab".repeat(32),
		status,
		createdAt: new Date(updatedAt),
		updatedAt: new Date(updatedAt),
	});
	objectStore.add(fileOriginalKey(id));
	return id;
};

beforeAll(async () => {
	await db.insert(organizations).values({
		id: ORG,
		name: "Sweep Org",
		slug: `sweep-org-${now}`,
	});
});

afterAll(async () => {
	await db.delete(organizations).where(eq(organizations.id, ORG));
	await dbWs.$client.end?.().catch(() => {});
});

describe("sweepOrphanFiles", () => {
	test("removes a ready file nothing references and keeps the rest", async () => {
		const orphan = await insertFile({
			status: "ready",
			updatedAt: now - 2 * HOUR,
		});
		const attached = await insertFile({
			status: "ready",
			updatedAt: now - 2 * HOUR,
		});
		await db.insert(attachments).values({
			fileId: attached,
			parentKind: "comment",
			parentId: crypto.randomUUID(),
		});
		const fresh = await insertFile({ status: "ready", updatedAt: now });
		const pending = await insertFile({
			status: "pending",
			updatedAt: now - 2 * HOUR,
		});

		await sweepOrphanFiles(now);

		const remaining = await db
			.select({ id: files.id })
			.from(files)
			.where(inArray(files.id, [orphan, attached, fresh, pending]));
		expect(remaining.map((row) => row.id).sort()).toEqual(
			[attached, fresh, pending].sort(),
		);
		expect(objectStore.has(fileOriginalKey(orphan))).toBe(false);
		expect(objectStore.has(fileOriginalKey(attached))).toBe(true);
	});
});
