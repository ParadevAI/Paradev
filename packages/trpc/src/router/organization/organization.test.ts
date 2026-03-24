import { beforeEach, describe, expect, it, mock } from "bun:test";
import type { TRPCError } from "@trpc/server";

const addMemberMock = mock(async (input: unknown) => input);
const findOrgMembershipMock = mock(async () => null);
const invitationFindFirstMock = mock(async () => null);
const verificationFindFirstMock = mock(async () => null);

mock.module("@superset/auth/stripe", () => ({
	stripeClient: {
		customers: {
			update: mock(async () => null),
		},
	},
}));

mock.module("@superset/db/client", () => ({
	db: {
		query: {
			invitations: {
				findFirst: invitationFindFirstMock,
			},
			verifications: {
				findFirst: verificationFindFirstMock,
			},
		},
	},
}));

mock.module("@superset/db/schema", () => ({
	members: {
		id: "members.id",
	},
	organizations: {
		id: "organizations.id",
	},
}));

mock.module("@superset/db/schema/auth", () => ({
	invitations: {
		id: "invitations.id",
	},
	sessions: {
		userId: "sessions.userId",
		activeOrganizationId: "sessions.activeOrganizationId",
	},
	verifications: {
		value: "verifications.value",
	},
}));

mock.module("@superset/db/seed-default-statuses", () => ({
	seedDefaultStatuses: mock(async () => undefined),
}));

mock.module("@superset/db/utils", () => ({
	findOrgMembership: findOrgMembershipMock,
}));

mock.module("drizzle-orm", () => ({
	and: (...conditions: unknown[]) => ({ type: "and", conditions }),
	eq: (left: unknown, right: unknown) => ({ type: "eq", left, right }),
	ne: (left: unknown, right: unknown) => ({ type: "ne", left, right }),
	sql: (
		strings: TemplateStringsArray,
		...values: unknown[]
	): { strings: string[]; values: unknown[] } => ({
		strings: [...strings],
		values,
	}),
}));

mock.module("../../lib/upload", () => ({
	generateImagePathname: mock(() => "organization/logo.png"),
	uploadImage: mock(async () => "https://example.com/logo.png"),
}));

const { createCallerFactory, createTRPCRouter } = await import("../../trpc");
const { organizationRouter } = await import("./organization");

const createCaller = createCallerFactory(
	createTRPCRouter({
		organization: organizationRouter,
	}),
);

const ORG_ID = "11111111-1111-4111-8111-111111111111";
const TARGET_USER_ID = "22222222-2222-4222-8222-222222222222";
const ACTOR_USER_ID = "33333333-3333-4333-8333-333333333333";
const INVITATION_ID = "44444444-4444-4444-8444-444444444444";
const INVITEE_EMAIL = "invitee@example.com";
const TOKEN = "token-123";

function createInvitation() {
	return {
		id: INVITATION_ID,
		email: INVITEE_EMAIL,
		role: "admin",
		status: "pending",
		expiresAt: new Date("2099-01-01T00:00:00.000Z"),
		organizationId: ORG_ID,
		organization: {
			id: ORG_ID,
			name: "Superset",
			slug: "superset",
			logo: "https://example.com/logo.png",
		},
		inviter: {
			id: TARGET_USER_ID,
			name: "Inviter",
			email: "inviter@example.com",
			image: "https://example.com/avatar.png",
		},
	};
}

function createContext({
	userId = ACTOR_USER_ID,
	email = "actor@example.com",
}: {
	userId?: string;
	email?: string;
} = {}) {
	return {
		session: {
			user: {
				id: userId,
				email,
			},
			session: {
				activeOrganizationId: ORG_ID,
			},
		} as never,
		auth: {
			api: {
				addMember: addMemberMock,
			},
		} as never,
		headers: new Headers({ cookie: "session=test" }),
	};
}

describe("organization router authorization", () => {
	beforeEach(() => {
		addMemberMock.mockReset();
		addMemberMock.mockImplementation(async (input: unknown) => input);
		findOrgMembershipMock.mockReset();
		findOrgMembershipMock.mockImplementation(async () => null);
		invitationFindFirstMock.mockReset();
		invitationFindFirstMock.mockImplementation(async () => null);
		verificationFindFirstMock.mockReset();
		verificationFindFirstMock.mockImplementation(async () => null);
	});

	it("rejects cross-tenant addMember attempts before calling auth.api.addMember", async () => {
		const caller = createCaller(createContext());

		await expect(
			caller.organization.addMember({
				organizationId: ORG_ID,
				userId: TARGET_USER_ID,
			}),
		).rejects.toMatchObject({
			code: "FORBIDDEN",
			message: "Not a member of this organization",
		} satisfies Partial<TRPCError>);

		expect(addMemberMock).not.toHaveBeenCalled();
	});

	it("requires admin or owner access to add members", async () => {
		findOrgMembershipMock.mockImplementation(async () => ({
			role: "member",
		}));
		const caller = createCaller(createContext());

		await expect(
			caller.organization.addMember({
				organizationId: ORG_ID,
				userId: TARGET_USER_ID,
			}),
		).rejects.toMatchObject({
			code: "FORBIDDEN",
			message: "Admin access required",
		} satisfies Partial<TRPCError>);

		expect(addMemberMock).not.toHaveBeenCalled();
	});

	it("allows org admins to add members to their own organization", async () => {
		findOrgMembershipMock.mockImplementation(async () => ({
			role: "admin",
		}));
		const caller = createCaller(createContext());

		await caller.organization.addMember({
			organizationId: ORG_ID,
			userId: TARGET_USER_ID,
		});

		expect(addMemberMock).toHaveBeenCalledWith({
			body: {
				organizationId: ORG_ID,
				userId: TARGET_USER_ID,
				role: "member",
			},
			headers: expect.any(Headers),
		});
	});

	it("requires authentication to read full invitation details", async () => {
		const caller = createCaller({
			session: null,
			auth: createContext().auth,
			headers: new Headers(),
		} as never);

		await expect(
			caller.organization.getInvitation(INVITATION_ID),
		).rejects.toMatchObject({
			code: "UNAUTHORIZED",
			message: "Not authenticated. Please sign in.",
		} satisfies Partial<TRPCError>);
	});

	it("allows the invited user to read their own invitation", async () => {
		invitationFindFirstMock.mockImplementation(async () => createInvitation());
		const caller = createCaller(
			createContext({
				email: INVITEE_EMAIL.toUpperCase(),
			}),
		);

		const result = await caller.organization.getInvitation(INVITATION_ID);

		expect(findOrgMembershipMock).not.toHaveBeenCalled();
		expect(result.email).toBe(INVITEE_EMAIL);
		expect(result.inviter.email).toBe("inviter@example.com");
	});

	it("requires admin access for non-invitees reading invitation details", async () => {
		invitationFindFirstMock.mockImplementation(async () => createInvitation());
		findOrgMembershipMock.mockImplementation(async () => ({
			role: "member",
		}));
		const caller = createCaller(createContext());

		await expect(
			caller.organization.getInvitation(INVITATION_ID),
		).rejects.toMatchObject({
			code: "FORBIDDEN",
			message: "Admin access required",
		} satisfies Partial<TRPCError>);
	});

	it("returns a limited invitation preview when a valid invitation-scoped token is provided", async () => {
		invitationFindFirstMock.mockImplementation(async () => createInvitation());
		verificationFindFirstMock.mockImplementation(async () => ({
			identifier: INVITATION_ID,
			expiresAt: new Date("2099-01-02T00:00:00.000Z"),
		}));
		const caller = createCaller(createContext());

		const result = await caller.organization.getInvitationPreview({
			invitationId: INVITATION_ID,
			token: TOKEN,
		});

		expect(result.organization.name).toBe("Superset");
		expect(result.inviter.name).toBe("Inviter");
		expect("email" in result.inviter).toBe(false);
		expect("id" in result.organization).toBe(false);
	});

	it("accepts legacy email-scoped tokens for invitation preview", async () => {
		invitationFindFirstMock.mockImplementation(async () => createInvitation());
		verificationFindFirstMock.mockImplementation(async () => ({
			identifier: INVITEE_EMAIL.toUpperCase(),
			expiresAt: new Date("2099-01-02T00:00:00.000Z"),
		}));
		const caller = createCaller(createContext());

		const result = await caller.organization.getInvitationPreview({
			invitationId: INVITATION_ID,
			token: TOKEN,
		});

		expect(result.organization.name).toBe("Superset");
		expect(result.inviter.name).toBe("Inviter");
	});

	it("rejects invitation preview requests with invalid tokens", async () => {
		invitationFindFirstMock.mockImplementation(async () => createInvitation());
		verificationFindFirstMock.mockImplementation(async () => ({
			identifier: "someone-else@example.com",
			expiresAt: new Date("2099-01-02T00:00:00.000Z"),
		}));
		const caller = createCaller(createContext());

		await expect(
			caller.organization.getInvitationPreview({
				invitationId: INVITATION_ID,
				token: TOKEN,
			}),
		).rejects.toMatchObject({
			code: "NOT_FOUND",
			message: "Invitation not found",
		} satisfies Partial<TRPCError>);
	});
});
