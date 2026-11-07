import { describe, expect, test } from "bun:test";
import { isDevAvatar, randomDevAvatar } from "./dev-avatar";

describe("dev avatar", () => {
	test("accepts only known shapes, eyes and palette colors", () => {
		expect(isDevAvatar({ shape: "bean", eyes: "dots", color: "#5cc8a8" })).toBe(
			true,
		);
		expect(
			isDevAvatar({ shape: "dragon", eyes: "dots", color: "#5cc8a8" }),
		).toBe(false);
		expect(
			isDevAvatar({ shape: "bean", eyes: "lasers", color: "#5cc8a8" }),
		).toBe(false);
		expect(isDevAvatar({ shape: "bean", eyes: "dots", color: "#000000" })).toBe(
			false,
		);
		expect(isDevAvatar(null)).toBe(false);
	});

	test("random avatars are always valid", () => {
		for (let i = 0; i < 50; i++)
			expect(isDevAvatar(randomDevAvatar())).toBe(true);
	});
});
