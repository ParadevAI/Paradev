import { describe, expect, test } from "bun:test";
import {
	labelAncestorNames,
	labelLeafName,
	labelParentName,
	normalizeLabelName,
	sortLabelsAsTree,
} from "./labels";

describe("label paths", () => {
	test("normalizes each path segment", () => {
		expect(normalizeLabelName(" Acme / Client One /")).toBe("acme/client one");
		expect(normalizeLabelName("//")).toBeNull();
	});

	test("lists ancestors from the root down", () => {
		expect(labelAncestorNames("acme/web/api")).toEqual(["acme", "acme/web"]);
		expect(labelParentName("acme/web/api")).toBe("acme/web");
		expect(labelParentName("acme")).toBeNull();
		expect(labelLeafName("acme/web/api")).toBe("api");
	});

	test("orders children right after their parent", () => {
		const names = ["acme-labs", "acme/web", "acme", "beta", "acme/api"];
		expect(
			sortLabelsAsTree(names.map((name) => ({ name }))).map((l) => l.name),
		).toEqual(["acme", "acme/api", "acme/web", "acme-labs", "beta"]);
	});
});
