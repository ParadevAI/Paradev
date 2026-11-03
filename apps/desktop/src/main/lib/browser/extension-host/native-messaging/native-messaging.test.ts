import { expect, test } from "bun:test";
import { declaresNativeMessaging, extensionIdOf } from "./native-messaging";

const ONEPASSWORD = "aeblfdkhhhdcdjpifhhbdiojplfjncoa";

test("only an extension context names an extension; a website never does", () => {
	expect(extensionIdOf(`chrome-extension://${ONEPASSWORD}/background.js`)).toBe(
		ONEPASSWORD,
	);
	for (const url of [
		"https://example.com/",
		`https://${ONEPASSWORD}/`,
		"chrome-extension://not-an-id/",
		"about:blank",
		"",
		undefined,
	])
		expect(extensionIdOf(url)).toBeNull();
});

test("native messaging needs the permission in the manifest", () => {
	const extension = (permissions: unknown) =>
		({ manifest: { permissions } }) as Pick<Electron.Extension, "manifest">;
	expect(declaresNativeMessaging(extension(["nativeMessaging"]))).toBe(true);
	expect(declaresNativeMessaging(extension(["storage"]))).toBe(false);
	expect(declaresNativeMessaging(extension(undefined))).toBe(false);
	expect(declaresNativeMessaging(null)).toBe(false);
});
