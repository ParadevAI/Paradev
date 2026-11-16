import { expect, test } from "bun:test";
import { cachedFileLinks } from "./file-links.ts";

test("a file's link is reused while fresh, fetched again near its expiry, and a failure isn't kept", async () => {
	let clock = 0;
	const asked: string[] = [];
	let fail = false;
	const links = cachedFileLinks(
		async (id) => {
			asked.push(id);
			if (fail) throw new Error("offline");
			return {
				url: `https://api.test/files/${id}/content?token=${asked.length}`,
				expiresAt: new Date(clock + 10 * 60_000).toISOString(),
			};
		},
		() => clock,
	);

	const [a, b] = await Promise.all([links("f1"), links("f1")]);
	expect(a).toBe(b);
	expect(asked).toEqual(["f1"]);
	clock = 8 * 60_000;
	expect((await links("f1")).url).toEndWith("token=1");
	clock = 9.5 * 60_000;
	expect((await links("f1")).url).toEndWith("token=2");

	fail = true;
	await expect(links("f2")).rejects.toThrow("offline");
	fail = false;
	expect((await links("f2")).url).toContain("/files/f2/");
});
