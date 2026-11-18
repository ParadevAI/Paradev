import { createHash } from "node:crypto";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

export function terminalHostSocketPath(home: string): string {
	const path = join(home, "terminal-host.sock");
	// Darwin limits Unix socket paths to 104 bytes, including the terminator.
	if (Buffer.byteLength(path) < 104) return path;
	const id = createHash("sha256")
		.update(resolve(home))
		.digest("hex")
		.slice(0, 16);
	return join(tmpdir(), `paradev-terminal-${id}.sock`);
}
