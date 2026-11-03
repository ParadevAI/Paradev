import { afterEach, expect, type Mock, spyOn, test } from "bun:test";
import {
	existsSync,
	mkdirSync,
	mkdtempSync,
	readdirSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { app, ipcMain } from "electron";
import { DNR_CHANNEL } from "shared/browser-extension-dnr";
import {
	deleteExtensionRules,
	drainBeforeDelete,
	enforceDeclarativeNetRequest,
} from "./dnr-host";
import type { Rule } from "./types";

type Listener = (details: object, callback: (response: object) => void) => void;

let nextId = 0;

function setup(staticRules: Rule[], granted: string[] = ["<all_urls>"]) {
	const id = `dnrhosttest${Date.now()}x${nextId++}`;
	const dir = mkdtempSync(path.join(tmpdir(), "dnr-host-"));
	writeFileSync(path.join(dir, "rules.json"), JSON.stringify(staticRules));
	const extension = {
		id,
		name: "Test blocker",
		version: "1.0",
		path: dir,
		manifest: {
			permissions: ["declarativeNetRequest"],
			declarative_net_request: {
				rule_resources: [{ id: "main", enabled: true, path: "rules.json" }],
			},
		},
	};
	const extensionListeners: Record<
		string,
		(event: unknown, ext: unknown) => void
	> = {};
	const webRequestListeners: Record<string, Listener | null> = {};
	const register =
		(event: string) => (_filter: unknown, listener?: Listener) => {
			webRequestListeners[event] = listener ?? null;
		};
	const session = {
		extensions: {
			on: (event: string, listener: (event: unknown, ext: unknown) => void) => {
				extensionListeners[event] = listener;
			},
			getAllExtensions: () => [extension],
		},
		serviceWorkers: { on: () => {} },
		webRequest: {
			onBeforeRequest: register("beforeRequest"),
			onBeforeSendHeaders: register("beforeSendHeaders"),
			onHeadersReceived: register("headersReceived"),
		},
	};
	enforceDeclarativeNetRequest(session as never, {
		grantedAccess: () => granted,
	});
	const handler = (
		ipcMain.handle as Mock<
			(channel: string, handler: (...args: unknown[]) => unknown) => void
		>
	).mock.calls
		.filter(([channel]) => channel === DNR_CHANNEL)
		.at(-1)?.[1] as (...args: unknown[]) => Promise<unknown>;
	const call = (method: string, ...args: unknown[]) =>
		handler(
			{
				sender: { session },
				senderFrame: { url: `chrome-extension://${id}/` },
			},
			method,
			args,
		);
	const fire = (event: string, details: object) => {
		let response: object | undefined;
		webRequestListeners[event]?.(
			{ method: "GET", resourceType: "script", webContentsId: 3, ...details },
			(value) => {
				response = value;
			},
		);
		return response;
	};
	const rulesFile = path.join(
		app.getPath("userData"),
		"browser-extension-rules",
		`${id}.json`,
	);
	return {
		id,
		call,
		fire,
		rulesFile,
		unload: () => extensionListeners["extension-unloaded"]?.({}, extension),
	};
}

let now: ReturnType<typeof spyOn<DateConstructor, "now">> | null = null;
afterEach(() => now?.mockRestore());

test("getMatchedRules needs declarativeNetRequestFeedback", async () => {
	const { call } = setup([], ["<all_urls>"]);
	await expect(call("getMatchedRules")).rejects.toThrow(
		"declarativeNetRequestFeedback",
	);
});

test("getMatchedRules records allow and response-header rules, for five minutes", async () => {
	const { call, fire } = setup(
		[
			{
				id: 1,
				action: { type: "allow" },
				condition: { urlFilter: "||ok.example" },
			},
			{
				id: 2,
				priority: 2,
				action: {
					type: "modifyHeaders",
					responseHeaders: [{ header: "x-frame-options", operation: "remove" }],
				},
				condition: { urlFilter: "||ok.example" },
			},
		],
		["<all_urls>", "declarativeNetRequestFeedback"],
	);
	await call("getEnabledRulesets");
	now = spyOn(Date, "now").mockReturnValue(1_000_000);
	const details = { url: "https://ok.example/a.js", initiator: undefined };
	fire("beforeRequest", details);
	fire("beforeSendHeaders", { ...details, requestHeaders: {} });
	expect(
		fire("headersReceived", {
			...details,
			responseHeaders: { "X-Frame-Options": ["DENY"] },
		}),
	).toEqual({ responseHeaders: {} });
	const matched = (await call("getMatchedRules")) as {
		rulesMatchedInfo: { rule: { ruleId: number } }[];
	};
	expect(matched.rulesMatchedInfo.map((info) => info.rule.ruleId)).toEqual([
		1, 2,
	]);
	now.mockReturnValue(1_000_000 + 5 * 60_000 + 1);
	expect(await call("getMatchedRules")).toEqual({ rulesMatchedInfo: [] });
});

test("append joins a Cookie header with a semicolon", async () => {
	const { call, fire } = setup([
		{
			id: 1,
			action: {
				type: "modifyHeaders",
				requestHeaders: [
					{ header: "cookie", operation: "append", value: "b=2" },
				],
			},
			condition: { urlFilter: "||site.example" },
		},
	]);
	await call("getEnabledRulesets");
	expect(
		fire("beforeSendHeaders", {
			url: "https://site.example/",
			requestHeaders: { Cookie: "a=1" },
		}),
	).toEqual({ requestHeaders: { Cookie: "a=1; b=2" } });
});

test("isRegexSupported reports what RE2 would refuse", async () => {
	const { call } = setup([]);
	expect(await call("isRegexSupported", { regex: "^https?://ads\\." })).toEqual(
		{ isSupported: true },
	);
	for (const regex of ["a(?=b)", "(a)\\1", undefined]) {
		expect(await call("isRegexSupported", { regex })).toEqual({
			isSupported: false,
			reason: "syntaxError",
		});
	}
});

test("testMatchOutcome evaluates frame rules against topUrl", async () => {
	const { call } = setup([
		{
			id: 1,
			priority: 2,
			action: { type: "allowAllRequests" },
			condition: {
				urlFilter: "||trusted.example",
				resourceTypes: ["main_frame"],
			},
		},
		{
			id: 2,
			action: { type: "block" },
			condition: { urlFilter: "||ads.example" },
		},
	]);
	const request = { url: "https://ads.example/a.js", type: "script" };
	expect(await call("testMatchOutcome", request)).toEqual({
		matchedRules: [{ ruleId: 2, rulesetId: "main" }],
	});
	expect(
		await call("testMatchOutcome", {
			...request,
			topUrl: "https://trusted.example/",
		}),
	).toEqual({ matchedRules: [{ ruleId: 1, rulesetId: "main" }] });
});

test("an update that lands after uninstall does not recreate the file", async () => {
	const { call, unload, rulesFile, id } = setup([]);
	await call("getEnabledRulesets");
	const update = call("updateDynamicRules", {
		addRules: [
			{ id: 1, action: { type: "block" }, condition: { urlFilter: "x" } },
		],
	});
	unload();
	await deleteExtensionRules(id);
	await update;
	expect(existsSync(rulesFile)).toBe(false);
});

test("deleting rules waits for every unloaded instance's save", async () => {
	const id = `dnrhostdrain${Date.now()}`;
	let finishOlder = () => {};
	drainBeforeDelete(
		id,
		new Promise<void>((resolve) => {
			finishOlder = resolve;
		}),
	);
	drainBeforeDelete(id, Promise.resolve());
	let deleted = false;
	const deleting = deleteExtensionRules(id).then(() => {
		deleted = true;
	});
	await Bun.sleep(10);
	expect(deleted).toBe(false);
	finishOlder();
	await deleting;
	expect(deleted).toBe(true);
});

test("a failed save leaves no temp file behind", async () => {
	const { call, rulesFile, id } = setup([]);
	await call("getEnabledRulesets");
	mkdirSync(path.join(rulesFile, "blocker"), { recursive: true });
	await expect(
		call("updateDynamicRules", {
			addRules: [
				{ id: 1, action: { type: "block" }, condition: { urlFilter: "x" } },
			],
		}),
	).rejects.toThrow();
	expect(
		readdirSync(path.dirname(rulesFile)).filter((name) =>
			name.startsWith(`${id}.json.`),
		),
	).toEqual([]);
});
