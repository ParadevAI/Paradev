import { describe, expect, test } from "bun:test";
import {
	coverageIssues,
	docsTableSkills,
	readmeSkills,
	renderBundledSkills,
} from "./bundled-skills";

describe("docsTableSkills", () => {
	test("reads the skill of each table row", () => {
		const page = [
			"| Skill | What it does |",
			"|:------|:-------------|",
			"| `superset:setup` | Makes a repo ready, see `superset:page` |",
			"| `superset:10x` | Audits |",
			"",
			"- `superset:feedback` in prose",
		].join("\n");
		expect(docsTableSkills(page)).toEqual(["setup", "10x"]);
	});
});

describe("readmeSkills", () => {
	test("reads only the skills that lead each bullet", () => {
		const readme = [
			"## How the skills work",
			"",
			"- **Account skills** (`orchestrate`, `setup`,",
			"  `panes`): the CLI reads `paradev` state.",
			"- **`plugins` and `integrations`**: `paradev mcp` sends calls.",
			"- **`feedback`** and **`contribute`** use `gh`.",
			"",
			"## Data handling",
			"",
			"- **`page`** uploads HTML.",
		].join("\n");
		expect(readmeSkills(readme)).toEqual([
			"orchestrate",
			"setup",
			"panes",
			"plugins",
			"integrations",
			"feedback",
			"contribute",
		]);
	});
});

describe("coverageIssues", () => {
	test("reports missing, unknown and repeated skills", () => {
		expect(
			coverageIssues("doc", ["setup", "setup", "ghost"], ["setup", "page"]),
		).toEqual([
			{ name: "doc", problem: "missing page" },
			{ name: "doc", problem: "names ghost, which is not a bundled skill" },
			{ name: "doc", problem: "repeats setup" },
		]);
	});

	test("is empty when the lists match", () => {
		expect(coverageIssues("doc", ["page", "setup"], ["setup", "page"])).toEqual(
			[],
		);
	});
});

test("renderBundledSkills keeps names and descriptions as string literals", () => {
	expect(
		renderBundledSkills([{ name: "10x", description: 'Say "hi"' }]),
	).toContain('\t\tname: "10x",\n\t\tdescription: "Say \\"hi\\"",');
});
