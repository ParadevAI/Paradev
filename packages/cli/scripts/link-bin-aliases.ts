import { rmSync, symlinkSync } from "node:fs";
import { join } from "node:path";
import { CLI_BIN_ALIASES } from "../src/lib/bin-aliases";

/** Relative links, so the tarball, install.sh, Homebrew and `superset update` all carry them. */
export function linkBinAliases(binDir: string): void {
	for (const alias of CLI_BIN_ALIASES) {
		const linkPath = join(binDir, alias);
		rmSync(linkPath, { force: true });
		symlinkSync("superset", linkPath);
	}
}
