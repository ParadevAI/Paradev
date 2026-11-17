import { describe, expect, test } from "bun:test";
import { apiKey } from "@better-auth/api-key";
import { db } from "@superset/db/client";
import { TRPCError } from "@trpc/server";
import { betterAuth } from "better-auth";
import { memoryAdapter } from "better-auth/adapters/memory";
import { organization } from "better-auth/plugins";
import { stub } from "../../../test/stub";

let memberRows: Array<{ id: string; userId: string; role: string }> = [];
stub(db.query.members, {
	findFirst: async () => ({ role: "owner" }),
	findMany: async () => memberRows,
});
stub(db.query.teams, { findFirst: async () => ({ id: "team" }) });

const { apiKeyRouter } = await import("../../router/api-key");
const { organizationRouter } = await import("../../router/organization");
const { teamRouter } = await import("../../router/team");
const { createCallerFactory, createTRPCContext, createTRPCRouter } =
	await import("../../trpc");

async function setup() {
	const auth = betterAuth({
		secret: "test-secret-at-least-32-characters-long",
		baseURL: "http://localhost:3000",
		database: memoryAdapter({
			user: [],
			session: [],
			account: [],
			verification: [],
			organization: [],
			member: [],
			invitation: [],
			team: [],
			teamMember: [],
			apikey: [],
		}),
		advanced: { database: { generateId: () => crypto.randomUUID() } },
		emailAndPassword: { enabled: true },
		plugins: [
			organization({ teams: { enabled: true } }),
			apiKey({ enableMetadata: true }),
		],
	});
	const signUp = async (email: string) => {
		const result = await auth.api.signUpEmail({
			body: { email, password: "password1234", name: email },
			returnHeaders: true,
		});
		const cookie = result.headers.get("set-cookie")?.split(";")[0] ?? "";
		return { user: result.response.user, headers: new Headers({ cookie }) };
	};
	const a = await signUp("a@example.com");
	const b = await signUp("b@example.com");
	const c = await signUp("c@example.com");
	const org = await auth.api.createOrganization({
		body: { name: "Acme", slug: "acme", userId: a.user.id },
	});
	if (!org) throw new Error("organization not created");
	await auth.api.setActiveOrganization({
		body: { organizationId: org.id },
		headers: a.headers,
	});
	const memberB = await auth.api.addMember({
		body: { organizationId: org.id, userId: b.user.id, role: "member" },
	});
	if (!memberB) throw new Error("member not added");
	const memberA = await auth.api.getActiveMember({ headers: a.headers });
	if (!memberA) throw new Error("no active member");
	const removedMemberId = crypto.randomUUID();
	memberRows = [
		{ id: memberA.id, userId: a.user.id, role: "owner" },
		{ id: memberB.id, userId: b.user.id, role: "member" },
		{ id: removedMemberId, userId: crypto.randomUUID(), role: "member" },
	];
	const teams = await auth.api.listOrganizationTeams({
		query: { organizationId: org.id },
		headers: a.headers,
	});
	const session = await auth.api.getSession({ headers: a.headers });
	if (!session) throw new Error("no session");

	const caller = (headers: Headers) =>
		createCallerFactory(
			createTRPCRouter({
				apiKey: apiKeyRouter,
				organization: organizationRouter,
				team: teamRouter,
			}),
		)(
			createTRPCContext({
				session: session as never,
				auth: auth as never,
				headers,
			}),
		);
	return { a, b, c, org, removedMemberId, teamId: teams[0]?.id ?? "", caller };
}

type Setup = Awaited<ReturnType<typeof setup>>;

const cases: Array<{
	name: string;
	call: (s: Setup) => Promise<unknown>;
	code: TRPCError["code"];
	message: string;
}> = [
	{
		name: "organization.addMember: user already a member",
		call: ({ caller, a, org, b }) =>
			caller(a.headers).organization.addMember({
				organizationId: org.id,
				userId: b.user.id,
			}),
		code: "BAD_REQUEST",
		message: "User is already a member of this organization",
	},
	{
		name: "team.addMember: user not in the organization",
		call: ({ caller, a, c, teamId }) =>
			caller(a.headers).team.addMember({ teamId, userId: c.user.id }),
		code: "BAD_REQUEST",
		message: "User is not a member of the organization",
	},
	{
		name: "organization.removeMember: better-auth cannot resolve the session",
		call: ({ caller, org, b }) =>
			caller(new Headers()).organization.removeMember({
				organizationId: org.id,
				userId: b.user.id,
			}),
		code: "FORBIDDEN",
		message: "Unauthorized",
	},
	{
		name: "organization.updateMemberRole: member removed meanwhile",
		call: ({ caller, a, org, removedMemberId }) =>
			caller(a.headers).organization.updateMemberRole({
				organizationId: org.id,
				memberId: removedMemberId,
				role: "admin",
			}),
		code: "BAD_REQUEST",
		message: "Member not found",
	},
	{
		name: "apiKey.create: name longer than 32 characters",
		call: ({ caller, a }) =>
			caller(a.headers).apiKey.create({ name: "x".repeat(33) }),
		code: "BAD_REQUEST",
		message: "The name length is either too large or too small.",
	},
];

describe("better-auth user errors through the routers", () => {
	test.each(cases)("$name", async ({ call, code, message }) => {
		const s = await setup();
		const error = await call(s).then(
			() => null,
			(e: unknown) => e,
		);
		expect(error).toBeInstanceOf(TRPCError);
		expect((error as TRPCError).code).toBe(code);
		expect((error as TRPCError).message).toBe(message);
	});
});
