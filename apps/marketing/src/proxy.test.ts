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

	test("serves canonical paths without a redirect", async () => {
		expect((await run("/careers")).rewrite).toBe("/en/careers");
		expect(await run("/zh-CN/careers")).toMatchObject({
			status: undefined,
			location: undefined,
		});
	});
});
