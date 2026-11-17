import { afterAll, beforeAll, expect, mock, test } from "bun:test";

const objectStore = new Map<string, Uint8Array>();
mock.module("../../lib/r2", () => ({
	getObject: async (key: string) =>
		objectStore.has(key) ? new Response(objectStore.get(key)) : null,
	headObject: async (key: string) => {
		const body = objectStore.get(key);
		return body ? { sizeBytes: body.length, contentType: null } : null;
	},
	putObject: async ({ key, body }: { key: string; body: Uint8Array }) => {
		objectStore.set(key, body);
	},
	deleteObjects: async (keys: string[]) => {
		for (const key of keys) objectStore.delete(key);
	},
	presignedGetUrl: async (key: string) => `https://storage.test/${key}`,
	presignedPutUrl: async ({ key }: { key: string }) => ({
		url: `https://storage.test/${key}`,
		headers: {},
	}),
}));

const published: { channel: string; type: string }[] = [];
mock.module("./publish", () => ({
	publishChats: (channel: string, data: { type: string }) => {
		published.push({ channel, type: data.type });
	},
}));

const { db, dbWs } = await import("@superset/db/client");
const { files, members, organizations, users } = await import(
	"@superset/db/schema"
);
const { chatsGroupChannel } = await import("@superset/shared/chats-realtime");
const { fileOriginalKey } = await import("@superset/shared/usercontent");
const { eq, inArray } = await import("drizzle-orm");
const { attachmentRouter } = await import("../attachment");
const { chatsRouter } = await import("./chats");
const { createCallerFactory, createTRPCContext, createTRPCRouter } =
	await import("../../trpc");

const ORG = crypto.randomUUID();
const OWNER = crypto.randomUUID();
const MEMBER = crypto.randomUUID();
const OUTSIDER = crypto.randomUUID();
const PEOPLE = [OWNER, MEMBER, OUTSIDER];
const suffix = Date.now();
const COLOR = "#F2B23E";

const callerFor = (userId: string) =>
	createCallerFactory(
		createTRPCRouter({ chats: chatsRouter, attachment: attachmentRouter }),
	)(
		createTRPCContext({
			session: {
				user: { id: userId, email: `${userId}@example.com` },
				session: { activeOrganizationId: ORG },
			} as never,
			auth: {} as never,
			headers: new Headers(),
		}),
	);
const owner = callerFor(OWNER);
const member = callerFor(MEMBER);
const outsider = callerFor(OUTSIDER);

const code = (call: Promise<unknown>) =>
	call.then(
		() => "OK",
		(error: { code?: string }) => error.code,
	);

/** A group the owner made, with the member added to it. */
async function sharedGroup() {
	const created = await owner.chats.createGroup({
		organizationId: ORG,
		title: "Launch",
	});
	await owner.chats.addMember({ groupId: created.group.id, userId: MEMBER });
	return created;
}

beforeAll(async () => {
	await db
		.insert(organizations)
		.values({ id: ORG, name: "Chats Org", slug: `chats-org-${suffix}` });
	await db.insert(users).values(
		PEOPLE.map((id, index) => ({
			id,
			name: `Person ${index}`,
			email: `chats-${index}-${suffix}@example.com`,
			organizationIds: [ORG],
		})),
	);
	await db.insert(members).values(
		PEOPLE.map((userId) => ({
			id: crypto.randomUUID(),
			organizationId: ORG,
			userId,
			role: "member",
			createdAt: new Date(),
		})),
	);
});

afterAll(async () => {
	await db.delete(organizations).where(eq(organizations.id, ORG));
	await db.delete(users).where(inArray(users.id, PEOPLE));
	await dbWs.$client.end?.().catch(() => {});
});

test("a group comes with its own Dev, and a non-member cannot tell it exists", async () => {
	const created = await sharedGroup();
	expect(created.dev.kind).toBe("group");
	expect(created.groupDev.devId).toBe(created.dev.id);
	expect(
		await code(
			outsider.chats.sendMessage({ groupId: created.group.id, text: "hi" }),
		),
	).toBe("NOT_FOUND");
});

test("a send repeated with its clientId posts once", async () => {
	const { group } = await sharedGroup();
	published.length = 0;
	const send = () =>
		member.chats.sendMessage({
			groupId: group.id,
			text: "hello",
			clientId: "local-1",
		});
	const first = await send();
	const again = await send();
	expect(again.message.id).toBe(first.message.id);
	expect(published).toEqual([
		{ channel: chatsGroupChannel(group.id), type: "message.created" },
	]);
});

test("only a group's owner renames or deletes it", async () => {
	const { group } = await sharedGroup();
	expect(
		await code(member.chats.renameGroup({ groupId: group.id, title: "Mine" })),
	).toBe("FORBIDDEN");
	expect(await code(member.chats.deleteGroup({ groupId: group.id }))).toBe(
		"FORBIDDEN",
	);
	expect(await code(owner.chats.deleteGroup({ groupId: group.id }))).toBe("OK");
});

test("the owner removes people and others leave; their Devs go with them", async () => {
	const { group } = await sharedGroup();
	const mine = await member.chats.createDev({
		organizationId: ORG,
		name: "Helper",
		color: COLOR,
		description: "Helps",
	});
	await member.chats.addDevToGroup({ groupId: group.id, devId: mine.dev.id });
	const target = { groupId: group.id, userId: MEMBER };
	expect(
		await code(member.chats.removeMember({ groupId: group.id, userId: OWNER })),
	).toBe("FORBIDDEN");
	expect(
		await code(owner.chats.removeMember({ groupId: group.id, userId: OWNER })),
	).toBe("BAD_REQUEST");
	expect(await code(member.chats.removeMember(target))).toBe("OK");
	const after = await owner.chats.bootstrap({ organizationId: ORG });
	const left = after.groups.find((entry) => entry.id === group.id);
	expect(left?.members.map((person) => person.id)).toEqual([OWNER]);
	expect(
		after.groupDevs.some(
			(link) => link.groupId === group.id && link.devId === mine.dev.id,
		),
	).toBe(false);
	expect(
		await code(member.chats.sendMessage({ groupId: group.id, text: "hi" })),
	).toBe("NOT_FOUND");
});

test("a Dev is changed by its owner; a member who shares a group with it is refused, anyone else hears not found", async () => {
	const { group } = await sharedGroup();
	const made = await owner.chats.createDev({
		organizationId: ORG,
		name: "Reviewer",
		color: COLOR,
		description: "Reads pull requests",
	});
	await owner.chats.addDevToGroup({ groupId: group.id, devId: made.dev.id });
	const patch = { devId: made.dev.id, name: "Critic" };
	expect(await code(member.chats.updateDev(patch))).toBe("FORBIDDEN");
	expect(await code(outsider.chats.updateDev(patch))).toBe("NOT_FOUND");
	expect((await owner.chats.updateDev(patch)).name).toBe("Critic");
});

test("deleting a Dev a person made takes its 1:1 with it; a personal Dev stays", async () => {
	const personal = await owner.chats.createPersonalDev({
		organizationId: ORG,
		name: "Scout",
		color: COLOR,
	});
	const made = await owner.chats.createDev({
		organizationId: ORG,
		name: "Notes",
		color: COLOR,
		description: "Writes release notes",
	});
	expect(await code(owner.chats.deleteDev({ devId: personal.dev.id }))).toBe(
		"BAD_REQUEST",
	);
	await owner.chats.deleteDev({ devId: made.dev.id });
	const after = await owner.chats.bootstrap({ organizationId: ORG });
	expect(after.groups.some((group) => group.id === made.group.id)).toBe(false);
	expect(after.groups.some((group) => group.id === personal.group.id)).toBe(
		true,
	);
});

test("a shared file opens for the chat's members only, and goes when its message is deleted", async () => {
	const { group } = await sharedGroup();
	const bytes = new TextEncoder().encode("notes");
	const { fileId } = await member.attachment.createUpload({
		name: "notes.txt",
		contentType: "text/plain",
		sizeBytes: bytes.length,
	});
	const unsent = { groupId: group.id, fileId, clientId: "local-file" };
	expect(await code(member.chats.sendFile(unsent))).toBe("BAD_REQUEST");

	objectStore.set(fileOriginalKey(fileId), bytes);
	const sent = await member.chats.sendFile({ ...unsent, text: "see this" });
	expect(sent.file.name).toBe("notes.txt");
	expect(sent.message.text).toBe("see this");
	expect(await code(owner.chats.fileLink({ fileId }))).toBe("OK");
	expect(await code(outsider.chats.fileLink({ fileId }))).toBe("NOT_FOUND");

	await member.chats.deleteMessage({ messageId: sent.message.id });
	expect(objectStore.has(fileOriginalKey(fileId))).toBe(false);
	expect(await db.select().from(files).where(eq(files.id, fileId))).toEqual([]);
});
