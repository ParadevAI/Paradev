import { beforeEach, describe, expect, it } from "bun:test";
import { useCreatePrFormIntent } from "./createPrFormIntent";

describe("useCreatePrFormIntent", () => {
	beforeEach(() => {
		useCreatePrFormIntent.setState({ workspaceId: null });
	});

	it("hands a request only to the workspace that made it, once", () => {
		const { request, consume } = useCreatePrFormIntent.getState();
		request("a");

		expect(consume("b")).toBe(false);
		expect(useCreatePrFormIntent.getState().workspaceId).toBe("a");
		expect(consume("a")).toBe(true);
		expect(consume("a")).toBe(false);
	});
});
