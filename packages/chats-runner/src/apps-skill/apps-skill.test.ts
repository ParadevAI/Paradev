import { expect, test } from "bun:test";
import {
	existsSync,
	mkdirSync,
	mkdtempSync,
	readFileSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { APPS_SKILL, writeAppsSkill } from "./apps-skill.ts";

test("the sketches skill is written into the Dev's folder, replacing an edited copy and the old apps skill", () => {
	const agentDir = mkdtempSync(join(tmpdir(), "apps-skill-"));
	mkdirSync(join(agentDir, "skills/dev-apps"), { recursive: true });
	writeFileSync(join(agentDir, "skills/dev-apps/SKILL.md"), "old");
	const path = writeAppsSkill(agentDir);
	expect(path).toBe(join(agentDir, APPS_SKILL));
	const skill = readFileSync(path, "utf8");
	expect(skill).toStartWith("---\nname: dev-sketches\ndescription: ");
	expect(existsSync(join(agentDir, "skills/dev-apps"))).toBe(false);
	for (const must of [
		"--dev-safe-bottom",
		"var(--dev-chart-1)",
		"dev-layout",
		"16 px",
		"44 × 44",
		"subscribe(",
		"export default function",
		"dev file share",
		"dev sketch preview",
		"## When to sketch",
		"Lead with the point",
		"dev sketch save",
		"dev sketch unsave <id>",
		"dev sketch delete <id>",
		"confirm",
		'"unsaved"',
		"--width 390",
		"Read the screenshot",
		'"unavailable"',
		"dev.agent.ask(question)",
		'"no_agent"',
		"dev.ui.setActions",
		"dev.ui.confirm",
		"dev.ui.pick",
		"never draws its own title bar",
	]) {
		expect(skill).toContain(must);
	}
	writeFileSync(path, "edited in the box");
	writeAppsSkill(agentDir);
	expect(readFileSync(path, "utf8")).toBe(skill);
});
