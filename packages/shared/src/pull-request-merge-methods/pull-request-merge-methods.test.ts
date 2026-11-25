import { describe, expect, test } from "bun:test";
import {
	type MergeMethodChoices,
	mergeMethodChoices,
} from "./pull-request-merge-methods";

describe("mergeMethodChoices", () => {
	test("a squash-only repository offers only squash", () => {
		expect(
			mergeMethodChoices({
				allowedMergeMethods: ["squash"],
				defaultMergeMethod: "squash",
			}),
		).toEqual({ methods: ["squash"], primary: "squash" });
	});

	test("a merge-commit-only repository never makes squash primary", () => {
		expect(
			mergeMethodChoices({
				allowedMergeMethods: ["merge"],
				defaultMergeMethod: "merge",
			}),
		).toEqual({ methods: ["merge"], primary: "merge" });
	});

	test("lists allowed methods in GitHub's order and uses the viewer default", () => {
		expect(
			mergeMethodChoices({
				allowedMergeMethods: ["squash", "merge", "rebase"],
				defaultMergeMethod: "rebase",
			}),
		).toEqual({ methods: ["merge", "squash", "rebase"], primary: "rebase" });
	});

	test("without a default from an older server, keeps squash when it is allowed", () => {
		expect(
			mergeMethodChoices({ allowedMergeMethods: ["squash", "rebase"] }),
		).toEqual({ methods: ["squash", "rebase"], primary: "squash" });
		expect(mergeMethodChoices({ allowedMergeMethods: ["rebase"] })).toEqual({
			methods: ["rebase"],
			primary: "rebase",
		});
	});

	test("ignores a default the repository does not allow", () => {
		expect(
			mergeMethodChoices({
				allowedMergeMethods: ["merge", "rebase"],
				defaultMergeMethod: "squash",
			}).primary,
		).toBe("merge");
	});

	test("without settings, offers every method with squash primary", () => {
		const today: MergeMethodChoices = {
			methods: ["squash", "merge", "rebase"],
			primary: "squash",
		};
		expect(mergeMethodChoices(null)).toEqual(today);
		expect(mergeMethodChoices({ allowedMergeMethods: [] })).toEqual(today);
		expect(
			mergeMethodChoices({ allowedMergeMethods: ["fast-forward"] }),
		).toEqual(today);
	});
});
