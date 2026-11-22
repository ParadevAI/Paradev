import { describe, expect, test } from "bun:test";
import { prunePlaceKeys } from "./prunePlaceKeys";

describe("prunePlaceKeys", () => {
	test("forgets collapsed places that are gone and keeps everything else", () => {
		const collapsed = {
			"m1:__place": true,
			"gone:__place": true,
			"cloud:__place": true,
			"gone:p1": true,
		} as const;
		expect(prunePlaceKeys(collapsed, ["m1", "cloud"])).toEqual({
			"m1:__place": true,
			"cloud:__place": true,
			"gone:p1": true,
		});
		const kept = { "m1:__place": true } as const;
		expect(prunePlaceKeys(kept, ["m1"])).toBe(kept);
	});
});
