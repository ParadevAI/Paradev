import { readFile } from "node:fs/promises";
import path from "node:path";

const REPO_RAW = "https://raw.githubusercontent.com/paradevai/skills/main";

export const BUNDLED_SKILLS_DIR = path.join(
	process.cwd(),
	"../../plugins/superset/skills",
);

export const EXTERNAL_SKILL_NAMES = [
	"superset-orchestrate",
	"superset-setup",
	"superset-automate",
	"superset-standup",
	"superset-doctor",
	"superset-feedback",
	"superset-10x",
	"superset-contribute",
	"superset-mcp",
] as const;

export const BUNDLED_SKILL_NAMES = [
	"browser",
	"computer",
	"environment",
	"integrations",
	"page",
	"panes",
	"plugins",
] as const;

export const SKILL_NAMES = [
	...EXTERNAL_SKILL_NAMES,
	...BUNDLED_SKILL_NAMES,
] as const;
export type SkillName = (typeof SKILL_NAMES)[number];

export function isSkillName(value: string): value is SkillName {
	return (SKILL_NAMES as readonly string[]).includes(value);
}

function isBundledSkillName(
	name: SkillName,
): name is (typeof BUNDLED_SKILL_NAMES)[number] {
	return (BUNDLED_SKILL_NAMES as readonly string[]).includes(name);
}

export async function fetchSkill(name: SkillName): Promise<string | null> {
	if (isBundledSkillName(name)) {
		return readFile(
			path.join(BUNDLED_SKILLS_DIR, name, "SKILL.md"),
			"utf-8",
		).catch(() => null);
	}
	const response = await fetch(`${REPO_RAW}/skills/${name}/SKILL.md`, {
		next: { revalidate: 3600 },
	});
	if (!response.ok) {
		return null;
	}
	return response.text();
}
