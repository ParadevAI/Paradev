import { beforeEach, describe, expect, it } from "bun:test";
import { useShipFormIntent } from "./shipFormIntent";

describe("useShipFormIntent", () => {
	beforeEach(() => {
		useShipFormIntent.setState({ intent: null });
	});

	it("hands the requested view only to the workspace that asked, once", () => {
		const { request, consume } = useShipFormIntent.getState();
		request({ workspaceId: "a", view: "commit" });

		expect(consume("b")).toBeNull();
		expect(useShipFormIntent.getState().intent?.workspaceId).toBe("a");
		expect(consume("a")).toBe("commit");
		expect(consume("a")).toBeNull();
	});
});
