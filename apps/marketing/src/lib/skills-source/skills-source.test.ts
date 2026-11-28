import { describe, expect, test } from "bun:test";
import { SUPERSET_MANAGED_SKILLS } from "@superset/shared/plugins";
import matter from "gray-matter";
import { fetchSkill, SKILL_NAMES } from "./skills-source";

const URLS_BEFORE_LOCAL_SOURCE = [
	"superset-orchestrate",
	"superset-setup",
	"superset-automate",
	"superset-standup",
	"superset-doctor",
	"superset-feedback",
	"superset-10x",
	"superset-contribute",
	"superset-mcp",
	"browser",
	"computer",
	"environment",
	"integrations",
	"page",
	"panes",
	"plugins",
];

describe("agent skills source", () => {
	test("every published URL stays listed", () => {
		for (const name of URLS_BEFORE_LOCAL_SOURCE) {
			expect(SKILL_NAMES).toContain(name);
		}
	});

	test("each bundled skill is listed once", () => {
		expect(new Set(SKILL_NAMES).size).toBe(SKILL_NAMES.length);
		expect(SKILL_NAMES.length).toBe(SUPERSET_MANAGED_SKILLS.length + 1);
	});

	test("each local skill is served with the name its URL publishes", async () => {
		for (const name of SKILL_NAMES.filter((n) => n !== "superset-mcp")) {
			const content = await fetchSkill(name);
			expect(content === null ? null : matter(content).data.name).toBe(name);
		}
	});

	test("an unknown name is not served", async () => {
		expect(await fetchSkill("superset-browser")).toBeNull();
	});
});
