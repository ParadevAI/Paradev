import { describe, expect, test } from "bun:test";
import { placeDetail } from "./placeDetail";

describe("placeDetail", () => {
	test("names the project and the place, or only the place", () => {
		expect(
			placeDetail({ placeName: "Studio-Mini", projectName: "demo-app" }),
		).toBe("demo-app · Studio-Mini");
		expect(placeDetail({ placeName: "Cloud", projectName: null })).toBe(
			"Cloud",
		);
	});
});
