import { describe, expect, test } from "bun:test";
import matter from "gray-matter";
import { BUNDLED_SKILL_NAMES, fetchSkill } from "./skills-source";

describe("bundled skills", () => {
	test("each one is served from its SKILL.md under the same name", async () => {
		for (const name of BUNDLED_SKILL_NAMES) {
			const content = await fetchSkill(name);
			expect(content === null ? null : matter(content).data.name).toBe(name);
		}
	});
});
