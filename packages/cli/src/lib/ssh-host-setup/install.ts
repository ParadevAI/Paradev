import { shellQuote } from "../shell-quote";

export function installCliScript({
	installerUrl,
	installDir,
	version,
}: {
	installerUrl: string;
	installDir: string;
	version: string | null;
}): string {
	const tag = version ? `cli-v${version}` : "latest";
	return `set -e
script=$(mktemp)
trap 'rm -f "$script"' EXIT
curl -fsSL ${shellQuote(installerUrl)} -o "$script"
SUPERSET_HOME=${shellQuote(installDir)} SUPERSET_VERSION=${shellQuote(tag)} sh "$script" --no-next-steps --fallback-latest`;
}
