import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { db, dbWs } from "@superset/db/client";
import {
	attachments,
	cloudWorkspaces,
	environments,
	files,
	organizations,
	users,
} from "@superset/db/schema";
import { eq, inArray } from "drizzle-orm";
import { resolvableFiles, TRANSFER_ONLY } from "./resolvable";

const ORG = crypto.randomUUID();
const OWNER = crypto.randomUUID();
const TEAMMATE = crypto.randomUUID();
const now = Date.now();

const insertFile = async (
	status: "pending" | "ready",
	sha256 = TRANSFER_ONLY,
) => {
	const id = crypto.randomUUID();
	await db.insert(files).values({
		id,
		organizationId: ORG,
		name: "screenshot.png",
		contentType: "image/png",
		sizeBytes: 4,
		sha256,
		status,
		createdByUserId: OWNER,
	});
	return id;
};

const insertWorkspace = async (visibility: "org" | "just_me") => {
	const [environment] = await db
		.select({ id: environments.id })
		.from(environments)
		.where(eq(environments.organizationId, ORG));
	const id = crypto.randomUUID();
	await db.insert(cloudWorkspaces).values({
		id,
		organizationId: ORG,
		name: "box",
		branch: "main",
		baseBranch: "main",
		providerSandboxId: `box-${id}`,
		environmentId: environment?.id as string,
		visibility,
		createdByUserId: OWNER,
	});
	return id;
};

const anchor = (fileId: string, workspaceId: string) =>
	db.insert(attachments).values({
		fileId,
		parentKind: "cloud_workspace",
		parentId: workspaceId,
	});

const resolvable = async (
	userId: string,
	fileIds: string[],
	boxWorkspaceId: string | null = null,
) =>
	(
		await resolvableFiles({
			organizationId: ORG,
			userId,
			boxWorkspaceId,
			fileIds,
		})
	)
		.map((row) => row.id)
		.sort();

beforeAll(async () => {
	await db
		.insert(organizations)
		.values({ id: ORG, name: "Resolve Org", slug: `resolve-org-${now}` });
	await db.insert(users).values([
		{ id: OWNER, name: "Owner", email: `owner-${now}@example.com` },
		{ id: TEAMMATE, name: "Teammate", email: `teammate-${now}@example.com` },
	]);
	await db.insert(environments).values({
		organizationId: ORG,
		name: "default",
		sourceKind: "image",
		sourceRef: "image",
		bundleSha: "sha",
	});
});

afterAll(async () => {
	await db.delete(organizations).where(eq(organizations.id, ORG));
	await db.delete(users).where(inArray(users.id, [OWNER, TEAMMATE]));
	await dbWs.$client.end?.().catch(() => {});
});

describe("resolvableFiles", () => {
	test("an upload in flight resolves for anyone in the org", async () => {
		const pending = await insertFile("pending");
		expect(await resolvable(TEAMMATE, [pending])).toEqual([pending]);
	});

	test("a kept file resolves only through a workspace the caller can see", async () => {
		const shared = await insertWorkspace("org");
		const hidden = await insertWorkspace("just_me");
		const inShared = await insertFile("ready");
		const inHidden = await insertFile("ready");
		await anchor(inShared, shared);
		await anchor(inHidden, hidden);

		expect(await resolvable(OWNER, [inShared, inHidden])).toEqual(
			[inShared, inHidden].sort(),
		);
		expect(await resolvable(TEAMMATE, [inShared, inHidden])).toEqual([
			inShared,
		]);
	});

	test("a kept file on no cloud workspace does not resolve", async () => {
		const loose = await insertFile("ready");
		expect(await resolvable(OWNER, [loose])).toEqual([]);
	});

	test("a box resolves only its own files, never one in flight", async () => {
		const box = await insertWorkspace("org");
		const other = await insertWorkspace("org");
		const own = await insertFile("ready");
		const theirs = await insertFile("ready");
		const pending = await insertFile("pending");
		await anchor(own, box);
		await anchor(theirs, other);

		expect(await resolvable(OWNER, [own, theirs, pending], box)).toEqual([own]);
	});

	test("a page asset never resolves", async () => {
		const box = await insertWorkspace("org");
		const asset = await insertFile("ready", "ab".repeat(32));
		await anchor(asset, box);
		expect(await resolvable(OWNER, [asset])).toEqual([]);
	});
});
