import { describe, expect, test } from "bun:test";
import { withParentRoutes } from "./parentRoutes";

const PARENTS = [
	"workspace/[id]/index",
	"workspace/[id]/pull-request/[pullRequestId]/index",
	"pages/index",
];
const names = (routes: { name: string }[]) => routes.map((route) => route.name);

describe("withParentRoutes", () => {
	test("a deep link gets its parent screen below it", () => {
		const routes = withParentRoutes(
			[
				{ name: "(home)" },
				{
					name: "workspace/[id]/files-changed",
					params: { id: "w1", path: "a" },
				},
			],
			PARENTS,
		);
		expect(names(routes)).toEqual([
			"(home)",
			"workspace/[id]/index",
			"workspace/[id]/files-changed",
		]);
		expect(routes[1]?.params).toEqual({ id: "w1" });
	});

	test("every missing ancestor is added, outermost first", () => {
		expect(
			names(
				withParentRoutes(
					[
						{ name: "(home)" },
						{
							name: "workspace/[id]/pull-request/[pullRequestId]/checks",
							params: { id: "w1", pullRequestId: "7" },
						},
					],
					PARENTS,
				),
			),
		).toEqual([
			"(home)",
			"workspace/[id]/index",
			"workspace/[id]/pull-request/[pullRequestId]/index",
			"workspace/[id]/pull-request/[pullRequestId]/checks",
		]);
	});

	test("a route already above its parent is left alone", () => {
		const routes = [
			{ name: "(home)" },
			{ name: "workspace/[id]/index", params: { id: "w1" } },
			{ name: "workspace/[id]/files-changed", params: { id: "w1" } },
		];
		expect(withParentRoutes(routes, PARENTS)).toEqual(routes);
	});

	test("a parent whose params are missing is not added", () => {
		expect(
			names(
				withParentRoutes(
					[{ name: "(home)" }, { name: "workspace/[id]/files-changed" }],
					PARENTS,
				),
			),
		).toEqual(["(home)", "workspace/[id]/files-changed"]);
	});

	test("nothing goes below the first route", () => {
		expect(
			names(
				withParentRoutes(
					[{ name: "pages/[slug]/index", params: { slug: "s" } }],
					PARENTS,
				),
			),
		).toEqual(["pages/[slug]/index"]);
	});
});
