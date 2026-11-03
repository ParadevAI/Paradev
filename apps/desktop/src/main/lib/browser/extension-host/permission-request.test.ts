import { expect, type mock, test } from "bun:test";
import { dialog } from "electron";
import { confirmPermissionRequest } from "./permission-request";

test("an extension gets optional access only after the user allows it, and the question names it", async () => {
	const showMessageBox = dialog.showMessageBox as unknown as ReturnType<
		typeof mock
	>;
	const extension = { name: "LastPass" } as Electron.Extension;
	const request = {
		permissions: ["history"],
		origins: ["https://bank.test/*"],
	};

	showMessageBox.mockImplementationOnce(() => Promise.resolve({ response: 1 }));
	expect(await confirmPermissionRequest(extension, request)).toBe(false);
	const box = showMessageBox.mock.calls.at(-1)?.at(-1);
	expect(box?.message).toBe("LastPass wants more access");
	expect(box?.detail).toBe(
		"It can:\nRead and change your data on bank.test\nRead your browsing history",
	);

	showMessageBox.mockImplementationOnce(() => Promise.resolve({ response: 0 }));
	expect(await confirmPermissionRequest(extension, request)).toBe(true);
});
