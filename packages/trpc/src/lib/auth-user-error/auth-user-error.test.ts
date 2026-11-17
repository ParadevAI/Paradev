import { describe, expect, test } from "bun:test";
import { TRPCError } from "@trpc/server";
import { getHTTPStatusCodeFromError } from "@trpc/server/http";
import { betterAuth } from "better-auth";
import { memoryAdapter } from "better-auth/adapters/memory";
import { APIError } from "better-auth/api";
import { organization } from "better-auth/plugins";
import { withAuthUserErrors } from "./auth-user-error";

const ONE_TEAM_MESSAGE = "You should be a member of at least one team";

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
		}),
		emailAndPassword: { enabled: true },
		plugins: [
			organization({
				teams: { enabled: true },
				organizationHooks: {
					beforeRemoveTeamMember: async () => {
						throw new APIError("BAD_REQUEST", {
							message: ONE_TEAM_MESSAGE,
							code: "MUST_BELONG_TO_A_TEAM",
						});
					},
				},
			}),
		],
	});
	const signUp = await auth.api.signUpEmail({
		body: { email: "a@example.com", password: "password1234", name: "A" },
		returnHeaders: true,
	});
	const user = signUp.response.user;
	const cookie = signUp.headers.get("set-cookie")?.split(";")[0] ?? "";
	const headers = new Headers({ cookie });
	const org = await auth.api.createOrganization({
		body: { name: "Acme", slug: "acme", userId: user.id },
	});
	if (!org) throw new Error("organization not created");
	return { auth, user, headers, org };
}

async function rejection(call: Promise<unknown>): Promise<TRPCError> {
	const error = await withAuthUserErrors(call).then(
		() => null,
		(e: unknown) => e,
	);
	if (!(error instanceof TRPCError))
		throw new Error(`not a TRPCError: ${error}`);
	return error;
}

describe("withAuthUserErrors", () => {
	test("a taken organization slug is a 400 with better-auth's message", async () => {
		const { auth, user } = await setup();
		const error = await rejection(
			auth.api.createOrganization({
				body: { name: "Acme", slug: "acme", userId: user.id },
			}),
		);
		expect(error.code).toBe("BAD_REQUEST");
		expect(getHTTPStatusCodeFromError(error)).toBe(400);
		expect(error.message).toBe("Organization already exists");
		expect(error.cause).toMatchObject({
			i18nKey: "serverError.organization.alreadyExists",
		});
	});

	test("the only owner leaving is a 400 with better-auth's message", async () => {
		const { auth, headers, org } = await setup();
		const error = await rejection(
			auth.api.leaveOrganization({
				body: { organizationId: org.id },
				headers,
			}),
		);
		expect(error.code).toBe("BAD_REQUEST");
		expect(error.message).toBe(
			"You cannot leave the organization as the only owner",
		);
		expect(error.cause).toMatchObject({
			i18nKey: "serverError.organization.onlyOwnerCannotLeave",
		});
	});

	test("an APIError from a team hook is a 400 with the hook's message", async () => {
		const { auth, user, headers, org } = await setup();
		const teams = await auth.api.listOrganizationTeams({
			query: { organizationId: org.id },
			headers,
		});
		const error = await rejection(
			auth.api.removeTeamMember({
				body: {
					teamId: teams[0]?.id ?? "",
					userId: user.id,
					organizationId: org.id,
				},
				headers,
			}),
		);
		expect(error.code).toBe("BAD_REQUEST");
		expect(error.message).toBe(ONE_TEAM_MESSAGE);
		expect(error.cause).toMatchObject({
			i18nKey: "serverError.team.mustBelongToATeam",
		});
	});

	test("server failures pass through unchanged", async () => {
		const plain = new Error("database is down");
		await expect(withAuthUserErrors(Promise.reject(plain))).rejects.toBe(plain);
		const internal = new APIError("INTERNAL_SERVER_ERROR");
		await expect(withAuthUserErrors(Promise.reject(internal))).rejects.toBe(
			internal,
		);
	});
});
