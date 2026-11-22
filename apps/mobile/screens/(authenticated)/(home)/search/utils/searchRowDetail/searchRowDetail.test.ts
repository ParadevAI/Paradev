import { describe, expect, test } from "bun:test";
import { searchRowDetail } from "./searchRowDetail";

describe("searchRowDetail", () => {
	test("names the place under All hosts", () => {
		expect(
			searchRowDetail({
				placeName: "Studio-Mini",
				projectName: "demo-app",
				branch: "main",
			}),
		).toBe("demo-app · Studio-Mini");
		expect(
			searchRowDetail({ placeName: "Cloud", projectName: null, branch: "x" }),
		).toBe("Cloud");
	});

	test("shows project and branch inside one place", () => {
		expect(
			searchRowDetail({
				placeName: null,
				projectName: "demo-app",
				branch: "main",
			}),
		).toBe("demo-app · main");
	});
});
