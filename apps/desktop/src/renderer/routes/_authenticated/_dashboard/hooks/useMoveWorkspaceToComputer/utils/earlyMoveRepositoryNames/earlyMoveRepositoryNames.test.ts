import { expect, test } from "bun:test";
import { earlyMoveRepositoryNames } from "./earlyMoveRepositoryNames";

const repository = (owner: string | null, repoName: string | null) => ({
	owner,
	repoName,
});

test("a multi-repo workspace is checked on its own checkouts", () => {
	const project = {
		repositories: [repository("acme", "web"), repository("acme", "api")],
	};
	expect(earlyMoveRepositoryNames(["acme/web"], project)).toEqual(["acme/web"]);
});

test("a single-repo project without known checkouts uses its repository", () => {
	expect(
		earlyMoveRepositoryNames(null, {
			repositories: [repository("acme", "web")],
		}),
	).toEqual(["acme/web"]);
});

test("nothing is checked early when the checkouts are unknown in a multi-repo project", () => {
	const project = {
		repositories: [repository("acme", "web"), repository("acme", "api")],
	};
	expect(earlyMoveRepositoryNames(null, project)).toBeNull();
	expect(earlyMoveRepositoryNames([], project)).toBeNull();
	expect(earlyMoveRepositoryNames(null, undefined)).toBeNull();
});

test("a single repository with no GitHub name is not checked early", () => {
	expect(
		earlyMoveRepositoryNames(null, {
			repositories: [repository(null, null)],
		}),
	).toBeNull();
});
