import { describe, expect, test } from "bun:test";
import path from "node:path";
import { withPathDirs } from "./paths";

describe("withPathDirs", () => {
	test("moves first dirs to the front and last dirs to the end, once each", () => {
		const env = {
			Path: ["/tools", "/usr/bin", "/bin", "/wrappers"].join(path.delimiter),
		};
		expect(
			withPathDirs(env, { first: ["/wrappers"], last: ["/tools"] }),
		).toEqual({
			Path: ["/wrappers", "/usr/bin", "/bin", "/tools"].join(path.delimiter),
		});
	});
});
