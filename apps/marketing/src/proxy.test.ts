import { describe, expect, test } from "bun:test";
import { NextRequest } from "next/server";
import { proxy } from "./proxy";

const ORIGIN = "https://superset.sh";

async function run(path: string) {
	const response = await proxy(new NextRequest(`${ORIGIN}${path}`));
	return {
		status: response?.status,
		location: response?.headers.get("location")?.replace(ORIGIN, ""),
		rewrite: response?.headers.get("x-middleware-rewrite")?.replace(ORIGIN, ""),
	};
}

describe("proxy", () => {
	test("redirects a capitalized path to its lowercase form in one hop", async () => {
		expect(await run("/Careers?ref=yc")).toMatchObject({
			status: 308,
			location: "/careers?ref=yc",
		});
		expect((await run("/zh-cn/Careers")).location).toBe("/zh-CN/careers");
		expect((await run("/EN/Pricing")).location).toBe("/pricing");
		expect((await run("/User/Kitenite")).location).toBe("/kitenite");
		expect((await run("/JA/User/Kitenite")).location).toBe("/ja/kitenite");
		expect((await run("/EN/User/Kitenite")).location).toBe("/kitenite");
		expect((await run("/en/zh-cn/Careers")).location).toBe("/zh-CN/careers");
		expect((await run("/en/zh-cn/user/Kitenite")).location).toBe(
			"/zh-CN/kitenite",
		);
	});

	test("routes only the landing URLs, in every locale, without taking the land handle", async () => {
		for (const slug of [
			"claude-code-parallel-sessions",
			"claude-code-worktrees",
			"codex-cli-worktrees",
			"black-friday",
		]) {
			const path = `/land/${slug}`;
			const query = "?utm_source=test&utm_campaign=landing&gclid=a%2Bb";
			expect((await run(`${path}${query}`)).rewrite).toBe(
				`/en/en${path}${query}`,
			);
			expect(await run(`${path}/${query}`)).toMatchObject({
				status: 308,
				location: `${path}${query}`,
			});
			expect((await run(`/en${path}`)).location).toBe(path);
			expect((await run(`/en/en${path}`)).location).toBe(`/en${path}`);
			expect((await run(`/fr${path}${query}`)).rewrite).toBe(
				`/fr/en${path}${query}`,
			);
			expect((await run(`/zh-CN${path}`)).rewrite).toBe(`/zh-CN/en${path}`);
			expect(await run(`/fr${path}/`)).toMatchObject({
				status: 308,
				location: `/fr${path}`,
			});
		}
		expect((await run("/land")).rewrite).toBe("/en/user/land");
		expect((await run("/land/")).rewrite).toBe("/en/user/land/");
		expect((await run("/land/other")).rewrite).toBe("/en/land/other");
		expect((await run("/land/other/")).rewrite).toBe("/en/land/other/");
		expect((await run("/fr/land")).rewrite).toBe("/fr/user/land");
		expect((await run("/fr/land/other")).rewrite).toBeUndefined();
	});

	test("serves canonical paths without a redirect", async () => {
		expect((await run("/careers")).rewrite).toBe("/en/careers");
		expect(await run("/zh-CN/careers")).toMatchObject({
			status: undefined,
			location: undefined,
		});
	});
});
