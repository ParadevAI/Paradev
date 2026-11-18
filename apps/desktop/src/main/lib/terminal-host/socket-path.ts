import { createHash } from "node:crypto";
import { lstatSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

export function terminalHostSocketPath(
	home: string,
	temporaryRoot = tmpdir(),
): string {
	const path = join(home, "terminal-host.sock");
	// Darwin limits Unix socket paths to 104 bytes, including the terminator.
	if (Buffer.byteLength(path) < 104) return path;
	const id = createHash("sha256")
		.update(resolve(home))
		.digest("hex")
		.slice(0, 16);
	const directoryName = `paradev-terminal-${process.getuid()}`;
	let directory = join(temporaryRoot, directoryName);
	if (Buffer.byteLength(join(directory, `${id}.sock`)) >= 104) {
		directory = join("/tmp", directoryName);
	}
	try {
		mkdirSync(directory, { mode: 0o700 });
	} catch (error) {
		if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
	}
	const info = lstatSync(directory);
	if (
		!info.isDirectory() ||
		info.uid !== process.getuid() ||
		(info.mode & 0o077) !== 0
	) {
		throw new Error(
			"Terminal socket directory is not private to the current user",
		);
	}
	return join(directory, `${id}.sock`);
}
