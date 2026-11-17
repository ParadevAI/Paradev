export type HostTarget =
	| "darwin-arm64"
	| "darwin-x64"
	| "linux-arm64"
	| "linux-x64";

export type PlatformCheck =
	| { ok: true; target: HostTarget }
	| { ok: false; reason: string };

const ARCH: Record<string, "arm64" | "x64"> = {
	arm64: "arm64",
	aarch64: "arm64",
	x86_64: "x64",
	amd64: "x64",
};

/**
 * Maps `uname -s`, `uname -m` and the first line of `ldd --version` to a
 * release target. The Linux build links native modules against glibc.
 */
export function checkPlatform(
	system: string,
	machine: string,
	lddVersion: string,
): PlatformCheck {
	const arch = ARCH[machine.trim().toLowerCase()];
	const os = system.trim();
	if (!arch) {
		return {
			ok: false,
			reason: `the ${machine.trim()} architecture is not supported`,
		};
	}
	if (os === "Darwin") return { ok: true, target: `darwin-${arch}` };
	if (os !== "Linux") {
		return {
			ok: false,
			reason: `${os || "this system"} is not supported; hosts run on macOS and Linux`,
		};
	}
	if (/musl/i.test(lddVersion)) {
		return {
			ok: false,
			reason:
				"musl-based Linux (Alpine and similar) is not supported; the host needs glibc",
		};
	}
	return { ok: true, target: `linux-${arch}` };
}
