import { describe, expect, test } from "bun:test";
import { CONNECTOR_SLUGS, getConnector } from "@superset/shared/connectors";
import {
	ACCOUNT_ROUTED_CONNECTORS,
	isOneOrganizationPerAccount,
} from "./account-routing";

function check(slug: string): boolean {
	const connector = getConnector(slug);
	if (!connector) throw new Error(`no connector ${slug}`);
	return isOneOrganizationPerAccount(slug, connector);
}

describe("isOneOrganizationPerAccount", () => {
	test("a user-scoped plugin connector can share an account across organizations", () => {
		expect(check("notion_mcp")).toBe(false);
		expect(check("linear_mcp")).toBe(false);
	});

	test("a connector whose inbound events route by account keeps one organization", () => {
		expect(check("slack")).toBe(true);
		expect(check("notion")).toBe(true);
	});

	test("an org-scoped connector keeps one organization", () => {
		expect(check("sentry")).toBe(true);
		expect(check("microsoft_teams")).toBe(true);
	});

	test("every account-routed slug is a real connector", () => {
		for (const slug of ACCOUNT_ROUTED_CONNECTORS) {
			expect(CONNECTOR_SLUGS).toContain(slug);
		}
	});
});
