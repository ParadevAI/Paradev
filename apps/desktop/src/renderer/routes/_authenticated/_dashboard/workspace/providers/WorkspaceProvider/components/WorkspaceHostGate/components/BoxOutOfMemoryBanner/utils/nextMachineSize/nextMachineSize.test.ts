import { expect, test } from "bun:test";
import { nextMachineSize } from "./nextMachineSize";

test("suggests the next offered size up", () => {
	expect(nextMachineSize(["small", "medium", "large"], "medium")).toBe("large");
});

test("stays on the largest offered size", () => {
	expect(nextMachineSize(["small", "medium"], "medium")).toBe("medium");
});

test("never suggests a smaller size for a size the org no longer offers", () => {
	expect(nextMachineSize(["small", "medium", "large"], "xlarge")).toBe(
		"xlarge",
	);
});

test("picks the smallest larger size whatever the list order", () => {
	expect(nextMachineSize(["xlarge", "small", "large"], "medium")).toBe("large");
});
