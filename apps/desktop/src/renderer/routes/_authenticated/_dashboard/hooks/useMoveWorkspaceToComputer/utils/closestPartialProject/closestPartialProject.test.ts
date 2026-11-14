import { expect, test } from "bun:test";
import { closestPartialProject } from "./closestPartialProject";

const project = (name: string, ...fullNames: string[]) => ({
	name,
	repositories: fullNames.map((fullName) => {
		const [owner, repoName] = fullName.split("/");
		return { owner: owner ?? null, repoName: repoName ?? null };
	}),
});

const required = ["o/api", "o/web", "o/shared"];

test("names the repositories the closest project lacks", () => {
	const rows = [project("one", "o/web"), project("two", "O/API", "o/web")];
	expect(closestPartialProject(rows, required)).toEqual({
		project: rows[1],
		missing: ["o/shared"],
	});
});

test("returns null when no project holds any of them", () => {
	expect(
		closestPartialProject([project("other", "o/docs")], required),
	).toBeNull();
});

test("skips a project that holds them all", () => {
	expect(
		closestPartialProject(
			[project("all", "o/api", "o/web", "o/shared", "o/docs")],
			required,
		),
	).toBeNull();
});
