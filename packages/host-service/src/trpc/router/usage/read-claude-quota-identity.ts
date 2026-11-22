import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";

export async function readClaudeQuotaIdentity(
	configDir: string | null,
): Promise<string | null> {
	try {
		const state = JSON.parse(
			await readFile(join(configDir ?? homedir(), ".claude.json"), "utf8"),
		);
		const account = state.oauthAccount;
		const ids = [account?.accountUuid, account?.organizationUuid];
		if (!ids.every((id) => typeof id === "string" && id.length > 0))
			return null;
		return createHash("sha256").update(JSON.stringify(ids)).digest("hex");
	} catch {
		return null;
	}
}
