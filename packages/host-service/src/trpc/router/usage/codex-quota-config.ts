import { join } from "node:path";
import { parse as parseToml } from "smol-toml";
import {
	QuotaCredentialReadError,
	readQuotaCredentialFile,
} from "./quota-credentials";

export async function assertCodexFileCredentialStore(
	home: string,
): Promise<void> {
	const config = await readQuotaCredentialFile(join(home, "config.toml"));
	if (config === null) return;
	try {
		const parsed = parseToml(config);
		if (
			parsed.cli_auth_credentials_store !== undefined &&
			parsed.cli_auth_credentials_store !== "file"
		)
			throw new QuotaCredentialReadError();
	} catch {
		throw new QuotaCredentialReadError();
	}
}
