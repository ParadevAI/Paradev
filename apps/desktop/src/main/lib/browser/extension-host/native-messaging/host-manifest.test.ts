import { afterAll, expect, spyOn, test } from "bun:test";
import * as childProcess from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { NATIVE_MESSAGING_ERRORS } from "shared/browser-extension-native-messaging";
import {
	findNativeHost,
	isValidNativeHostName,
	nativeHostDirectories,
	parseNativeHostManifest,
	parseRegistryDefault,
	windowsHostRegistryKeys,
} from "./host-manifest";

const ONEPASSWORD = "aeblfdkhhhdcdjpifhhbdiojplfjncoa";
const OTHER = "hdokiejnpimakedhajhdlcegeplioahd";
const root = mkdtempSync(path.join(tmpdir(), "native-hosts-"));
afterAll(() => rmSync(root, { recursive: true, force: true }));

const manifest = (overrides: Record<string, unknown> = {}) =>
	JSON.stringify({
		name: "com.example.host",
		description: "Example",
		path: "/usr/bin/true",
		type: "stdio",
		allowed_origins: [`chrome-extension://${ONEPASSWORD}/`],
		...overrides,
	});

test("a host name follows Chrome's rule, so it cannot leave the host folders", () => {
	for (const name of ["com.1password.1password", "com.lastpass.nplastpass"])
		expect(isValidNativeHostName(name)).toBe(true);
	for (const name of [
		"../browser-extensions/x/1_0/native-host",
		"com/evil",
		"com..evil",
		".com",
		"Com.Evil",
		"com\\evil",
		"",
		42,
	])
		expect(isValidNativeHostName(name)).toBe(false);
});

test("a manifest must be a stdio host with an absolute path and exact extension origins", () => {
	const parse = (raw: string, platform: NodeJS.Platform = "darwin") =>
		parseNativeHostManifest(raw, "com.example.host", "/m/host.json", platform);
	expect(parse(manifest()).allowedOrigins).toEqual([
		`chrome-extension://${ONEPASSWORD}/`,
	]);
	expect(
		parse(
			manifest({ allowed_origins: [`chrome-extension://${ONEPASSWORD}/*`] }),
		).allowedOrigins,
	).toEqual([`chrome-extension://${ONEPASSWORD}/`]);
	for (const bad of [
		manifest({ name: "com.example.other" }),
		manifest({ type: "socket" }),
		manifest({ description: undefined }),
		manifest({ path: "relative/host" }),
		manifest({ allowed_origins: ["chrome-extension://*/"] }),
		manifest({ allowed_origins: ["https://example.com/"] }),
		manifest({ allowed_origins: undefined }),
	])
		expect(() => parse(bad)).toThrow();
	expect(parse(manifest({ path: "bin\\host.exe" }), "win32").path).toBe(
		path.resolve("/m", "bin\\host.exe"),
	);
});

test("macOS looks in Chrome's and Chromium's folders, system-level first", () => {
	expect(
		nativeHostDirectories({
			platform: "darwin",
			home: "/Users/me",
			appHostsDir: "/app/NativeMessagingHosts",
		}),
	).toEqual([
		"/Library/Google/Chrome/NativeMessagingHosts",
		"/Library/Application Support/Chromium/NativeMessagingHosts",
		"/app/NativeMessagingHosts",
		"/Users/me/Library/Application Support/Google/Chrome/NativeMessagingHosts",
		"/Users/me/Library/Application Support/Chromium/NativeMessagingHosts",
	]);
});

test("a host is found only for an extension its manifest allows", async () => {
	const home = path.join(root, "home");
	const appHostsDir = path.join(root, "app");
	const chromeDir = path.join(
		home,
		"Library/Application Support/Google/Chrome/NativeMessagingHosts",
	);
	mkdirSync(chromeDir, { recursive: true });
	mkdirSync(appHostsDir, { recursive: true });
	writeFileSync(path.join(chromeDir, "com.example.host.json"), manifest());
	writeFileSync(
		path.join(chromeDir, "com.example.missing.json"),
		manifest({ name: "com.example.missing", path: "/nonexistent/host" }),
	);
	const locations = { platform: "darwin" as const, home, appHostsDir };

	const found = await findNativeHost(
		"com.example.host",
		ONEPASSWORD,
		locations,
	);
	expect(found).toEqual({
		ok: true,
		host: {
			name: "com.example.host",
			path: "/usr/bin/true",
			allowedOrigins: [`chrome-extension://${ONEPASSWORD}/`],
		},
	});
	expect(await findNativeHost("com.example.host", OTHER, locations)).toEqual({
		ok: false,
		error: NATIVE_MESSAGING_ERRORS.forbidden,
	});
	expect(
		await findNativeHost("com.example.absent", ONEPASSWORD, locations),
	).toEqual({ ok: false, error: NATIVE_MESSAGING_ERRORS.notFound });
	expect(
		await findNativeHost("com.example.missing", ONEPASSWORD, locations),
	).toEqual({ ok: false, error: NATIVE_MESSAGING_ERRORS.notFound });
	expect(await findNativeHost("../host", ONEPASSWORD, locations)).toEqual({
		ok: false,
		error: NATIVE_MESSAGING_ERRORS.invalidName,
	});

	writeFileSync(
		path.join(appHostsDir, "com.example.host.json"),
		manifest({ allowed_origins: [`chrome-extension://${OTHER}/`] }),
	);
	expect(
		await findNativeHost("com.example.host", OTHER, locations),
	).toMatchObject({ ok: true });
});

test("Windows looks in both registry views, 32-bit first, and expands REG_EXPAND_SZ paths", () => {
	expect(windowsHostRegistryKeys("com.example.host").slice(0, 4)).toEqual([
		[
			"HKCU\\Software\\Google\\Chrome\\NativeMessagingHosts\\com.example.host",
			"/reg:32",
		],
		[
			"HKCU\\Software\\Chromium\\NativeMessagingHosts\\com.example.host",
			"/reg:32",
		],
		[
			"HKCU\\Software\\Google\\Chrome\\NativeMessagingHosts\\com.example.host",
			"/reg:64",
		],
		[
			"HKCU\\Software\\Chromium\\NativeMessagingHosts\\com.example.host",
			"/reg:64",
		],
	]);
	expect(windowsHostRegistryKeys("com.example.host")).toHaveLength(8);

	const output = (type: string, value: string) =>
		`\r\nHKEY_CURRENT_USER\\Software\\Google\\Chrome\\NativeMessagingHosts\\com.example.host\r\n    (Default)    ${type}    ${value}\r\n\r\n`;
	const env = { LOCALAPPDATA: "C:\\Users\\me\\AppData\\Local" };
	expect(
		parseRegistryDefault(
			output("REG_EXPAND_SZ", "%LOCALAPPDATA%\\host.json"),
			env,
		),
	).toBe("C:\\Users\\me\\AppData\\Local\\host.json");
	expect(
		parseRegistryDefault(output("REG_EXPAND_SZ", "%MISSING%\\host.json"), env),
	).toBe("%MISSING%\\host.json");
	expect(
		parseRegistryDefault(output("REG_SZ", "%LOCALAPPDATA%\\host.json"), env),
	).toBe("%LOCALAPPDATA%\\host.json");
	expect(parseRegistryDefault("ERROR: not found", env)).toBeNull();
});

test("a manifest that exists but cannot be read stops the lookup", async () => {
	const home = path.join(root, "unreadable-home");
	const appHostsDir = path.join(root, "unreadable-app");
	const chromeDir = path.join(
		home,
		"Library/Application Support/Google/Chrome/NativeMessagingHosts",
	);
	mkdirSync(chromeDir, { recursive: true });
	writeFileSync(path.join(chromeDir, "com.example.host.json"), manifest());
	// A directory where the higher-priority manifest goes fails with EISDIR.
	mkdirSync(path.join(appHostsDir, "com.example.host.json"), {
		recursive: true,
	});
	const warn = spyOn(console, "warn").mockImplementation(() => {});
	try {
		expect(
			await findNativeHost("com.example.host", ONEPASSWORD, {
				platform: "darwin",
				home,
				appHostsDir,
			}),
		).toEqual({ ok: false, error: NATIVE_MESSAGING_ERRORS.notFound });
		expect(warn).toHaveBeenCalled();
	} finally {
		warn.mockRestore();
	}
});

test("a registry query that fails for a reason other than a missing key is logged", async () => {
	let failure: NodeJS.ErrnoException | number = 1;
	const execFile = spyOn(childProcess, "execFile").mockImplementation(((
		_file: string,
		_args: string[],
		callback: (error: unknown, stdout: string) => void,
	) => {
		const error =
			typeof failure === "number"
				? Object.assign(new Error("Command failed"), { code: failure })
				: failure;
		callback(error, "");
	}) as unknown as typeof childProcess.execFile);
	const warn = spyOn(console, "warn").mockImplementation(() => {});
	const lookup = () =>
		findNativeHost("com.example.host", ONEPASSWORD, {
			platform: "win32",
			home: root,
			appHostsDir: path.join(root, "no-app-hosts"),
		});
	try {
		expect(await lookup()).toEqual({
			ok: false,
			error: NATIVE_MESSAGING_ERRORS.notFound,
		});
		expect(warn).not.toHaveBeenCalled();
		failure = Object.assign(new Error("spawn reg ENOENT"), { code: "ENOENT" });
		await lookup();
		expect(warn).toHaveBeenCalledTimes(8);
	} finally {
		execFile.mockRestore();
		warn.mockRestore();
	}
});
