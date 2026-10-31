import { expect, test } from "bun:test";
import { addedAccess, installWarnings } from "./install-warnings";

test("the install question names what a password manager can reach, as Chrome does", () => {
	expect(
		installWarnings({
			permissions: [
				"tabs",
				"webNavigation",
				"nativeMessaging",
				"storage",
				"clipboardRead",
				"notifications",
			],
			host_permissions: ["<all_urls>"],
		}),
	).toEqual([
		"Read and change all your data on all websites",
		"Read your browsing history",
		"Communicate with cooperating native applications",
		"Read data you copy and paste",
		"Display notifications",
	]);
});

test("an API with no warning line of its own still shows in the install question", () => {
	expect(
		installWarnings({ permissions: ["storage", "alarms", "debugger"] }),
	).toEqual(["Use more browser features: debugger"]);
});

test("content scripts on a few sites count as access to those sites", () => {
	expect(
		installWarnings({
			content_scripts: [
				{ matches: ["https://github.com/*", "https://*.github.com/*"] },
			],
		}),
	).toEqual(["Read and change your data on 2 websites"]);
});

test("an update or download that reaches further than the approved manifest names only the new access", () => {
	const approved = {
		permissions: ["storage"],
		host_permissions: ["https://github.com/*", "https://gitlab.com/*"],
	};
	expect(addedAccess(approved, approved)).toEqual([]);
	expect(
		addedAccess(approved, {
			permissions: ["storage", "tabs"],
			host_permissions: ["https://github.com/*", "https://bank.example/*"],
		}),
	).toEqual([
		"Read and change your data on bank.example",
		"Read your browsing history",
	]);
	expect(
		addedAccess(approved, { content_scripts: [{ matches: ["<all_urls>"] }] }),
	).toEqual(["Read and change all your data on all websites"]);
	expect(
		addedAccess(
			{ host_permissions: ["<all_urls>"] },
			{
				host_permissions: ["https://bank.example/*"],
			},
		),
	).toEqual([]);
	expect(
		addedAccess(
			{ host_permissions: ["http://*/*"] },
			{ host_permissions: ["http://*/*", "https://bank.test/*"] },
		),
	).toEqual(["Read and change your data on bank.test"]);
	expect(
		addedAccess(
			{ permissions: ["storage"], host_permissions: ["<all_urls>"] },
			{ permissions: ["storage", "cookies"], host_permissions: ["<all_urls>"] },
		),
	).toEqual(["Use more browser features: cookies"]);
});
