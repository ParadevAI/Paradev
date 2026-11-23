import { describe, expect, test } from "bun:test";
import { hostIdFromMachineId } from "@superset/shared/host-info";
import type { ApiClient } from "../api-client";
import { findRemoteHostKey, hostKeyName } from "./host-key";
import { machineIdProblem } from "./machine-id";
import { checkPlatform } from "./platform";
import { parseProbe } from "./probe";
import { launchdPlist, systemdUnit } from "./service";
import { sshFailureHint } from "./ssh-failure-hint";

describe("checkPlatform", () => {
	test("maps uname output to a release target", () => {
		expect(
			checkPlatform("Linux", "aarch64", "ldd (Ubuntu GLIBC 2.39) 2.39"),
		).toEqual({
			ok: true,
			target: "linux-arm64",
		});
		expect(checkPlatform("Darwin", "x86_64", "")).toEqual({
			ok: true,
			target: "darwin-x64",
		});
	});

	test("refuses musl Linux, other systems and other architectures with the reason", () => {
		expect(
			checkPlatform("Linux", "x86_64", "musl libc (x86_64)"),
		).toMatchObject({
			ok: false,
			reason: expect.stringContaining("glibc"),
		});
		expect(checkPlatform("FreeBSD", "amd64", "")).toMatchObject({ ok: false });
		expect(checkPlatform("Linux", "riscv64", "")).toMatchObject({ ok: false });
	});
});

describe("machineIdProblem", () => {
	test("flags an empty or placeholder id, accepts a real one", () => {
		expect(machineIdProblem("\n")).toContain("empty");
		expect(machineIdProblem("uninitialized")).toContain("empty");
		expect(machineIdProblem("3f1c2b0e9d8a4c7b6e5f4a3b2c1d0e9f\n")).toBeNull();
	});
});

describe("service files", () => {
	const input = {
		binPath: "/home/me/superset/bin/superset",
		organizationId: "org-1",
	};

	test("the systemd unit runs start in the foreground and keeps terminals on restart", () => {
		const unit = systemdUnit(input);
		expect(unit).toContain(
			'ExecStart="/home/me/superset/bin/superset" start --org "org-1"',
		);
		expect(unit).toContain("KillMode=process");
		expect(unit).not.toContain("--daemon");
	});

	test("the LaunchAgent restarts the host unless it exited cleanly", () => {
		const plist = launchdPlist(input);
		expect(plist).toContain("<string>start</string>");
		expect(plist).toContain("<key>SuccessfulExit</key>\n\t\t<false/>");
	});
});

describe("parseProbe", () => {
	test("reads the id the host derives its host id from on each system", () => {
		const linux = parseProbe(
			"system=Linux\nmachineid=abc\nversion=superset 1.37.0\nlinger=no\nbin=\n",
		);
		expect(linux).toMatchObject({
			machineId: "abc",
			version: "1.37.0",
			linger: false,
			bin: null,
			gh: null,
		});
		const mac = parseProbe(
			'system=Darwin\nmachineid=\nioreg=      "IOPlatformUUID" = "1234-ABCD"\n',
		);
		expect(mac.machineId).toBe("1234-ABCD");
	});

	test("derives the remote account's effective host ID from the probe", () => {
		const linux = "system=Linux\nmachineid=abc\n";
		expect(parseProbe(linux).hostId).toBe(hostIdFromMachineId("abc"));
		expect(parseProbe(`${linux}hostuid=1001\n`).hostId).toBe(
			hostIdFromMachineId("abc", 1001),
		);
	});
});

test("the systemd unit keeps a path with spaces and % as one word", () => {
	const unit = systemdUnit({
		binPath: "/home/Jo Doe/100%/superset",
		organizationId: "org-1",
	});
	expect(unit).toContain('ExecStart="/home/Jo Doe/100%%/superset" start');
});

test("the host key name fits better-auth's 32-character limit", () => {
	const name = hostKeyName(
		"Manageds-Virtual-Machine.local",
		"a97d7f26b38197e34cb10dc80a4461a8",
	);
	expect(name).toBe("Host a97d7f26 Manageds-Virtual-M");
	expect(name.length).toBeLessThanOrEqual(32);
});

test("finds the active legacy SSH key after the remote account changes its host ID", async () => {
	const hostname = "dev-box";
	const machineId = "shared-machine";
	const legacyName = hostKeyName(hostname, hostIdFromMachineId(machineId));
	const hostId = hostIdFromMachineId(machineId, 1002);
	const scopedName = hostKeyName(hostname, hostId);
	const api = {
		apiKey: {
			list: {
				query: async () => [
					{ id: "other-legacy-key", name: legacyName },
					{ id: "active-legacy-key", name: legacyName },
					{ id: "scoped-key", name: scopedName },
					{ id: "personal-key", name: "My scripts" },
				],
			},
		},
	} as unknown as ApiClient;
	const facts = {
		bin: "/opt/paradev/bin/superset",
		hostname,
		hostId,
		machineId,
	};
	const keyFor = (id: string) =>
		findRemoteHostKey(
			api,
			{
				target: "bob@dev-box",
				run: async () => ({ exitCode: 0, stdout: id, stderr: "" }),
			},
			facts,
		);

	expect(await keyFor("active-legacy-key")).toBe("active-legacy-key");
	expect(await keyFor("scoped-key")).toBe("scoped-key");
	expect(await keyFor("personal-key")).toBeUndefined();
});

describe("sshFailureHint", () => {
	test("names the cause ssh reported", () => {
		expect(
			sshFailureHint("Connection closed by 127.0.0.1 port 2233", "box"),
		).toContain("2 minutes");
		expect(
			sshFailureHint("dev@box: Permission denied (publickey,password).", "box"),
		).toContain("refused the login");
		expect(sshFailureHint("Host key verification failed.", "box")).toContain(
			"ssh-keygen -R",
		);
		expect(
			sshFailureHint("ssh: Could not resolve hostname nobox", "nobox"),
		).toContain("does not resolve");
		expect(sshFailureHint("", "box")).toBe(
			"Check it in a terminal first: ssh box",
		);
	});
});
