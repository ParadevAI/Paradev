import { describe, expect, test } from "bun:test";
import {
	TokenOrganizationError,
	tokenOrganizationId,
} from "./token-organization";

const ORG_A = "803f13a4-49b9-4664-826f-4090c750b0bc";
const ORG_B = "a1b2c3d4-e5f6-7890-abcd-ef1234567890";

describe("tokenOrganizationId", () => {
	test("an OAuth token's own organization wins over the header", () => {
		expect(tokenOrganizationId({ organizationId: ORG_A }, ORG_B)).toBe(ORG_A);
	});

	test("a session token with several organizations uses the requested one", () => {
		expect(
			tokenOrganizationId({ organizationIds: [ORG_A, ORG_B] }, ORG_B),
		).toBe(ORG_B);
	});

	test("a session token with one organization needs no header", () => {
		expect(tokenOrganizationId({ organizationIds: [ORG_A] }, null)).toBe(ORG_A);
	});

	test("rejects an organization the token does not cover", () => {
		expect(() =>
			tokenOrganizationId({ organizationIds: [ORG_A] }, ORG_B),
		).toThrow(TokenOrganizationError);
	});

	test("rejects a token with several organizations and no header", () => {
		expect(() =>
			tokenOrganizationId({ organizationIds: [ORG_A, ORG_B] }, null),
		).toThrow(/name one in the x-superset-organization-id header/);
	});

	test("rejects a token with no organization claim", () => {
		expect(() => tokenOrganizationId({}, ORG_A)).toThrow(
			/missing organizationId claim/,
		);
	});
});
