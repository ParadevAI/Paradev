import { expect, mock, test } from "bun:test";
import { desktopConnect } from "./desktopConnect";

const base = "https://api.superset.sh/api/auth/desktop/connect";
const options = () => ({
	webUrl: "https://app.superset.sh",
	enabled: "true",
	lookup: mock(async () => true),
	signInSocial: mock(async (_input: unknown) =>
		Response.json(
			{ url: "https://accounts.example/oauth" },
			{ headers: { "set-cookie": "old-state=issued; Secure" } },
		),
	),
});

test("validation errors happen before routing or OAuth", async () => {
	for (const [query, error] of [
		["", "Missing provider or state"],
		["?provider=google", "Missing provider or state"],
		["?provider=other&state=x", "Invalid provider"],
		["?provider=github&state=x&protocol=https", "Invalid protocol"],
	]) {
		const dependencies = options();
		const response = await desktopConnect(
			new Request(base + query),
			dependencies,
		);
		expect(response.status).toBe(400);
		expect(await response.text()).toBe(error);
		expect(dependencies.lookup).not.toHaveBeenCalled();
		expect(dependencies.signInSocial).not.toHaveBeenCalled();
		expect(response.headers.get("set-cookie")).toBeNull();
	}
});

test("moves both providers and protocol variants before issuing old OAuth state, preserving raw query", async () => {
	for (const provider of ["google", "github"]) {
		for (const protocol of [
			"superset",
			"superset-dev",
			"superset-my-worktree2",
			"Superset",
		]) {
			const query = `?provider=${provider}&state=a%2Fb+c&state=duplicate&protocol=${protocol}&local_callback=http%3A%2F%2F127.0.0.1%3A3456%2Fauth%2Fcallback`;
			const dependencies = options();
			const response = await desktopConnect(
				new Request(base + query),
				dependencies,
			);
			expect(response.status).toBe(307);
			expect(response.headers.get("location")).toBe(
				`https://api.paradev.com/api/auth/desktop/connect${query}`,
			);
			expect(response.headers.get("cache-control")).toBe("private, no-store");
			expect(response.headers.get("set-cookie")).not.toContain("old-state");
			expect(dependencies.signInSocial).not.toHaveBeenCalled();
		}
	}
});

test("gate off retains existing OAuth response and loopback validation without lookup or rollout cookie", async () => {
	for (const callback of [
		"http://localhost:3456/auth/callback",
		"https://evil.test/auth/callback",
		"garbage",
	]) {
		const dependencies = { ...options(), enabled: "false" };
		const response = await desktopConnect(
			new Request(
				`${base}?provider=google&state=test&local_callback=${encodeURIComponent(callback)}`,
			),
			dependencies,
		);
		expect(response.headers.get("location")).toBe(
			"https://accounts.example/oauth",
		);
		expect(response.headers.getSetCookie()).toEqual([
			"old-state=issued; Secure",
		]);
		expect(dependencies.lookup).not.toHaveBeenCalled();
		const input = dependencies.signInSocial.mock.calls[0]?.[0] as {
			body: { callbackURL: string };
		};
		const target = new URL(input.body.callbackURL);
		expect(target.searchParams.get("desktop_state")).toBe("test");
		expect(target.searchParams.get("desktop_local_callback")).toBe(
			callback.startsWith("http://localhost") ? callback : null,
		);
	}
});

test("final, stage, preview and non-GET requests retain existing OAuth path", async () => {
	for (const origin of [
		"https://api.paradev.com",
		"https://api.stage.paradev.com",
		"https://api.pr-1.paradev.com",
	]) {
		const dependencies = options();
		await desktopConnect(
			new Request(
				`${origin}/api/auth/desktop/connect?provider=github&state=test`,
			),
			dependencies,
		);
		expect(dependencies.lookup).not.toHaveBeenCalled();
		expect(dependencies.signInSocial).toHaveBeenCalledTimes(1);
	}
	const dependencies = options();
	await desktopConnect(
		new Request(`${base}?provider=google&state=test`, { method: "HEAD" }),
		dependencies,
	);
	expect(dependencies.lookup).not.toHaveBeenCalled();
});
