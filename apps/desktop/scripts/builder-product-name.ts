type BuildPlatform = "mac" | "linux" | "win";

const LONG_FLAGS: Record<string, BuildPlatform> = {
	"--mac": "mac",
	"--macos": "mac",
	"--linux": "linux",
	"--win": "win",
	"--windows": "win",
};

const SHORT_FLAGS: Record<string, BuildPlatform> = {
	m: "mac",
	o: "mac",
	l: "linux",
	w: "win",
};

const HOST_PLATFORMS: Partial<Record<NodeJS.Platform, BuildPlatform>> = {
	darwin: "mac",
	linux: "linux",
	win32: "win",
};

export function targetPlatforms(
	argv: string[],
	hostPlatform: NodeJS.Platform,
): Set<BuildPlatform> {
	const platforms = new Set<BuildPlatform>();
	for (const arg of argv) {
		const longFlag = LONG_FLAGS[arg.split("=")[0]];
		if (longFlag) platforms.add(longFlag);
		else if (/^-[a-z]+$/.test(arg)) {
			for (const letter of arg.slice(1)) {
				const shortFlag = SHORT_FLAGS[letter];
				if (shortFlag) platforms.add(shortFlag);
			}
		}
	}
	const hostBuild = HOST_PLATFORMS[hostPlatform];
	if (platforms.size === 0 && hostBuild) platforms.add(hostBuild);
	return platforms;
}

/**
 * The deb installs to /opt/<productName>, and the updater of released Linux
 * builds relaunches from the folder it ran in, so Linux keeps the legacy name.
 */
export function builderProductName({
	productName,
	legacyProductName,
	argv = process.argv,
	hostPlatform = process.platform,
}: {
	productName: string;
	legacyProductName: string;
	argv?: string[];
	hostPlatform?: NodeJS.Platform;
}): string {
	const platforms = targetPlatforms(argv, hostPlatform);
	if (!platforms.has("linux")) return productName;
	if (platforms.size > 1) {
		throw new Error(
			`Build Linux in its own electron-builder run: it packages as "${legacyProductName}", the other platforms as "${productName}".`,
		);
	}
	return legacyProductName;
}
