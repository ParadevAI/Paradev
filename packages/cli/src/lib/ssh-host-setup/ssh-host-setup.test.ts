import { describe, expect, test } from "bun:test";
import { hostKeyName } from "./host-key";
import { machineIdProblem } from "./machine-id";
import { checkPlatform } from "./platform";
import { parseProbe } from "./probe";
import { launchdPlist, systemdUnit } from "./service";

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
