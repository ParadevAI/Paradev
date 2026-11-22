import { expect, test } from "bun:test";
import { allowsNativeMessaging, extensionIdOf } from "./native-messaging";

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

test("native messaging follows the extension's granted permissions, including a runtime grant", () => {
	const extension = (manifest: Record<string, unknown>) =>
		({ manifest }) as Electron.Extension;
	const granted = new Map<Electron.Extension, string[]>();
	const options = {
		grantedAccess: (ext: Electron.Extension) => granted.get(ext) ?? [],
	};
	const optional = extension({ optional_permissions: ["nativeMessaging"] });
	expect(allowsNativeMessaging(optional, options)).toBe(false);
	granted.set(optional, ["nativeMessaging"]);
	expect(allowsNativeMessaging(optional, options)).toBe(true);
	const storage = extension({ permissions: ["storage"] });
	granted.set(storage, ["storage"]);
	expect(allowsNativeMessaging(storage, options)).toBe(false);
	expect(allowsNativeMessaging(null, options)).toBe(false);
});
