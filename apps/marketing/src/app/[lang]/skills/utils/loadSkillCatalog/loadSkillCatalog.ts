import matter from "gray-matter";
import { cacheLife } from "next/cache";
import {
	fetchSkill,
	SKILL_NAMES,
	type SkillName,
} from "@/app/.well-known/agent-skills/skills-source";

export interface SkillEntry {
	name: SkillName;
	summary: string;
	url: string;
}

function firstSentence(description: string): string {
	const end = description.search(/\.(\s|$)/);
	return end === -1 ? description : description.slice(0, end + 1);
}

export async function loadSkillCatalog(): Promise<SkillEntry[]> {
	"use cache";
	cacheLife({ revalidate: 3600 });
	const entries = await Promise.all(
		SKILL_NAMES.map(async (name) => {
			const content = await fetchSkill(name).catch(() => null);
			if (!content) return null;
			const description = String(matter(content).data.description ?? "");
			return {
				name,
				summary: firstSentence(description),
				url: `/.well-known/agent-skills/${name}/SKILL.md`,
			};
		}),
	);
	return entries.filter((entry) => entry !== null);
}
