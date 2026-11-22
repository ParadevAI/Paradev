import { describe, expect, test } from "bun:test";
import { searchRowDetail } from "./searchRowDetail";

describe("searchRowDetail", () => {
	test("names the project and the place", () => {
		expect(
			searchRowDetail({ placeName: "Studio-Mini", projectName: "demo-app" }),
		).toBe("demo-app · Studio-Mini");
	});

	test("names only the place when there is no project", () => {
		expect(searchRowDetail({ placeName: "Cloud", projectName: null })).toBe(
			"Cloud",
		);
	});
});
