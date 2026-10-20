import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { runInNewContext } from "node:vm";

type Step = { name: string; if?: string; run?: string };
type Job = { if?: string; needs?: string | string[]; steps: Step[] };
type Workflow = { jobs: Record<string, Job> };

function workflow(name: string): Workflow {
	return Bun.YAML.parse(
		readFileSync(join(import.meta.dir, name), "utf8"),
	) as Workflow;
}

function runs(
	condition: string | undefined,
	headRepository: string,
	actor = "contributor",
): boolean {
	if (!condition) return true;
	return (
		runInNewContext(condition, {
			always: () => true,
			github: {
				event_name: "pull_request",
				repository: "superset-sh/superset",
				actor,
				event: {
					pull_request: { head: { repo: { full_name: headRepository } } },
				},
			},
		}) === true
	);
}

const preview = workflow("deploy-preview.yml");
const cleanup = workflow("cleanup-preview.yml");
const sandbox = workflow("sandbox.yml");
const ci = workflow("ci.yml");

function job(jobs: Workflow["jobs"], id: string): Job {
	const found = jobs[id];
	if (!found) throw new Error(`Missing workflow job ${id}`);
	return found;
}

function step(job: Job, name: string): Step {
	const found = job.steps.find((step) => step.name === name);
	if (!found) throw new Error(`Missing workflow step ${name}`);
	return found;
}

test.each([
	["fork", "contributor/superset", "contributor", false],
	["same repository", "superset-sh/superset", "maintainer", true],
	["Dependabot", "superset-sh/superset", "dependabot[bot]", false],
] as const)("privileged preview jobs respect %s access", (_name, repository, actor, allowed) => {
	for (const id of ["create-database", "post-final-comment"]) {
		expect(runs(job(preview.jobs, id).if, repository, actor)).toBe(allowed);
	}
	expect(runs(job(cleanup.jobs, "cleanup").if, repository, actor)).toBe(
		allowed,
	);
});

test("all deployment jobs depend on the privileged database gate", () => {
	for (const [id, definition] of Object.entries(preview.jobs)) {
		if (id === "create-database" || id === "post-final-comment") continue;
		const needs = Array.isArray(definition.needs)
			? definition.needs
			: [definition.needs];
		expect(needs).toContain("create-database");
		expect(definition.if).toBeUndefined();
	}
});

test("only the sandbox bucket dry run requires a trusted PR", () => {
	const boot = job(sandbox.jobs, "boot-twice");
	const dry = step(boot, "Step versions that would re-run on the next wake");
	expect(runs(dry.if, "contributor/superset")).toBe(false);
	expect(runs(dry.if, "superset-sh/superset", "dependabot[bot]")).toBe(false);
	expect(runs(dry.if, "superset-sh/superset", "maintainer")).toBe(true);
});

test("fork PRs still run the sandbox tests, build, and real boot checks", () => {
	const boot = job(sandbox.jobs, "boot-twice");
	expect(runs(boot.if, "contributor/superset")).toBe(true);
	for (const name of [
		"Manifest tests",
		"Build the bundle",
		"Set up the Docker builder",
		"Build the image locally",
		"Boot it twice",
		"Check the runner against a synthetic bundle",
	]) {
		expect(runs(step(boot, name).if, "contributor/superset")).toBe(true);
	}
});

test("CI runs the workflow policy tests", () => {
	expect(step(job(ci.jobs, "test"), "Workflow fork-safety tests").run).toBe(
		"bun test ./.github/workflows/fork-safety.test.ts",
	);
});
