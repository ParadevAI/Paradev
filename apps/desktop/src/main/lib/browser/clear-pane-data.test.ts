import { describe, expect, it, mock } from "bun:test";
import { clearPaneData } from "./clear-pane-data";

function fakeSession(extensionIds: string[]) {
	return {
		extensions: { getAllExtensions: () => extensionIds.map((id) => ({ id })) },
		clearData: mock(async (_options?: object) => {}),
		clearCache: mock(async () => {}),
		clearStorageData: mock(async (_options?: object) => {}),
	};
}

describe("clearPaneData", () => {
	it("clears site data but keeps every installed extension's own data", async () => {
		const ses = fakeSession(["lastpass", "onepassword"]);
		const keep = {
			excludeOrigins: [
				"chrome-extension://lastpass",
				"chrome-extension://onepassword",
			],
		};

		await clearPaneData(ses, "all");
		await clearPaneData(ses, "storage");

		expect(ses.clearData.mock.calls).toEqual([
			[keep],
			[{ dataTypes: ["localStorage", "indexedDB"], ...keep }],
		]);
		expect(ses.clearStorageData).not.toHaveBeenCalled();
		expect(ses.clearCache).toHaveBeenCalledTimes(1);
	});
});
