import { describe, expect, test } from "bun:test";

import {
	isAuthPageRoute,
	isInternalRoute,
	isPublicRoute,
	safeRedirectUrl,
} from "./proxy-routes";

describe("isPublicRoute", () => {
	test.each([
		"/sign-in",
		"/sign-in/callback",
		"/sign-up",
		"/auth/desktop",
		"/auth/desktop/success",
		"/api/auth/desktop",
		"/api/auth/desktop/callback",
		"/accept-invitation",
		"/accept-invitation/invitation-123",
		"/cli/auth/code",
		"/cli/auth/code/success",
		"/tasks/my-slug",
		"/automations/automation-123",
		"/workspaces/f48e8a62-ac73-4e31-b9bd-7477932fd0ee",
		"/plugins",
		"/plugins/linear",
		"/environments/environment-123",
		"/page",
		"/page/my-published-page",
		"/robots.txt",
	])("allows the exact public route or its children: %s", (pathname: string) => {
		expect(isPublicRoute(pathname)).toBe(true);
	});

	test.each([
		"/",
		"/dashboard",
		"/sign-internal",
		"/sign-internal/settings",
		"/sign-upgrade",
		"/auth/desktopish",
		"/api/auth/desktopish",
		"/accept-invitation-list",
		"/cli/auth/codegen",
		"/tasksy",
		"/automations-overview",
		"/workspaces-list",
		"/environmentsy",
		"/pages",
	])("keeps sibling routes protected: %s", (pathname: string) => {
		expect(isPublicRoute(pathname)).toBe(false);
	});
});

describe("isAuthPageRoute", () => {
	test.each([
		"/sign-in",
		"/sign-in/callback",
		"/sign-up",
		"/sign-up/verify",
	])("matches auth page routes exactly or by child path: %s", (pathname: string) => {
		expect(isAuthPageRoute(pathname)).toBe(true);
	});

	test.each([
		"/",
		"/dashboard",
		"/sign-internal",
		"/sign-internal/settings",
		"/sign-upgrade",
	])("does not match sibling routes for authenticated redirects: %s", (pathname: string) => {
		expect(isAuthPageRoute(pathname)).toBe(false);
	});
});

describe("isInternalRoute", () => {
	test.each([
		"/design",
		"/design/tokens",
	])("matches internal routes exactly or by child path: %s", (pathname: string) => {
		expect(isInternalRoute(pathname)).toBe(true);
	});

	test.each([
		"/",
		"/designer",
		"/dashboard",
	])("keeps sibling routes out of the internal gate: %s", (pathname: string) => {
		expect(isInternalRoute(pathname)).toBe(false);
	});
});

describe("safeRedirectUrl", () => {
	const origin = "https://app.superset.sh";

	test("keeps a same-origin path with its query", () => {
		expect(safeRedirectUrl("/settings?tab=billing", origin)?.href).toBe(
			"https://app.superset.sh/settings?tab=billing",
		);
	});

	test("rejects other origins, including ones URL parsing creates", () => {
		for (const value of [
			null,
			"",
			"https://evil.example",
			"//evil.example",
			"/\\evil.example",
			"/\t/evil.example",
			"/\n/evil.example",
			"/\r\\evil.example",
		]) {
			expect(safeRedirectUrl(value, origin)).toBeNull();
		}
	});

	test("rejects auth pages so a signed-in redirect cannot loop", () => {
		expect(safeRedirectUrl("/sign-in?redirect=/x", origin)).toBeNull();
		expect(safeRedirectUrl("/sign-up", origin)).toBeNull();
	});
});
