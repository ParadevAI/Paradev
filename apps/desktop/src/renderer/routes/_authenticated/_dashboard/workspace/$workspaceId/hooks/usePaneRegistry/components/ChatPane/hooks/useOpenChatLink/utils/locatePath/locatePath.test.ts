import { expect, mock, test } from "bun:test";
import { locatePath } from "./locatePath";

const FOUND = { resolvedPath: "/repo/src/app.ts", isDirectory: false };

test("a path that exists as written is not looked up again", async () => {
	const resolveFile = mock(async () => null);
	expect(
		await locatePath("src/app.ts", { stat: async () => FOUND, resolveFile }),
	).toEqual(FOUND);
	expect(resolveFile).not.toHaveBeenCalled();
});

test("a shortened path opens the file the host resolves it to", async () => {
	const resolveFile = mock(async (_reference: string) => ({
		resolvedPath: "/repo/src/app.ts",
	}));
	expect(
		await locatePath("app.ts", { stat: async () => null, resolveFile }),
	).toEqual(FOUND);
	expect(resolveFile.mock.calls).toEqual([["app.ts"]]);
});

test("a path nothing matches, or a host without the lookup, is not found", async () => {
	const stat = async () => null;
	expect(
		await locatePath("nope.ts", { stat, resolveFile: async () => null }),
	).toBeNull();
	expect(
		await locatePath("nope.ts", {
			stat,
			resolveFile: async () => {
				throw new Error(
					'No procedure found on path "filesystem.resolveFileReference"',
				);
			},
		}),
	).toBeNull();
});

test("a host that cannot be reached is an error, not a missing path", async () => {
	const stat = async () => {
		throw new Error("Failed to fetch");
	};
	await expect(
		locatePath("src/app.ts", { stat, resolveFile: async () => null }),
	).rejects.toThrow("Failed to fetch");
});
