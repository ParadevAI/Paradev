import { expect, test } from "bun:test";
import { checkoutInput } from "./checkoutInput";

test("names the repository only when there is one", () => {
	expect(checkoutInput("ws", "api")).toEqual({
		workspaceId: "ws",
		repositoryId: "api",
	});
	expect(Object.keys(checkoutInput("ws", undefined))).toEqual(["workspaceId"]);
});
