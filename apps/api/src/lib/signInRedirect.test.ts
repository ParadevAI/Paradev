import { describe, expect, test } from "bun:test";
import { isBrowserNavigation, unauthenticatedResponse } from "./signInRedirect";

const navigation = { "sec-fetch-dest": "document", accept: "text/html" };
const fallback = () => new Response("Unauthorized", { status: 401 });

function signInRedirect(url: string, headers: HeadersInit = navigation): URL {
	const response = unauthenticatedResponse(
		new Request(url, { headers }),
		fallback(),
	);
	expect(response.status).toBe(302);
	return new URL(response.headers.get("location") ?? "");
}

describe("unauthenticatedResponse", () => {
	test("a browser with no session is sent to sign in and back to the URL it opened", () => {
		const connect =
			"https://api.superset.sh/api/connectors/ahrefs_mcp/connect?organizationId=org-1&method=oauth2&plugin=ahrefs";

		const location = signInRedirect(connect);

		expect(location.origin).toBe("https://app.superset.sh");
		expect(location.pathname).toBe("/sign-in");
		expect(location.searchParams.get("redirect")).toBe(connect);
		expect(location.searchParams.has("reason")).toBe(false);
	});

	test("a browser whose session cookie no longer resolves is told its session expired", () => {
		const file = "https://api.paradev.com/api/tasks/task-1/files/file-1";

		const location = signInRedirect(file, {
			...navigation,
			cookie: "__Secure-better-auth.session_token=revoked.signature",
		});

		expect(location.origin).toBe("https://app.paradev.com");
		expect(location.searchParams.get("redirect")).toBe(file);
		expect(location.searchParams.get("reason")).toBe("session_expired");
	});

	test("sign-in happens on the request's own root domain, where its cookie will be sent", () => {
		const location = signInRedirect(
			"https://api.paradev.com/api/connectors/ahrefs_mcp/connect?organizationId=org-1",
		);

		expect(location.origin).toBe("https://app.paradev.com");
	});

	test("callers that are not a page navigation keep the error", async () => {
		for (const headers of [
			{},
			{ accept: "application/json" },
			{ "sec-fetch-dest": "image", accept: "image/avif,text/html" },
			{ "sec-fetch-dest": "empty", accept: "*/*" },
		]) {
			const response = unauthenticatedResponse(
				new Request("https://api.superset.sh/api/proxy/linear-image", {
					headers,
				}),
				fallback(),
			);
			expect(response.status).toBe(401);
			expect(await response.text()).toBe("Unauthorized");
		}
	});
});

describe("isBrowserNavigation", () => {
	test("accepts navigations from browsers with and without fetch metadata", () => {
		expect(
			isBrowserNavigation(
				new Request("https://x.test", { headers: navigation }),
			),
		).toBe(true);
		expect(
			isBrowserNavigation(
				new Request("https://x.test", { headers: { accept: "text/html,*/*" } }),
			),
		).toBe(true);
		expect(
			isBrowserNavigation(
				new Request("https://x.test", { method: "POST", headers: navigation }),
			),
		).toBe(false);
	});
});
