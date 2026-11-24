import { parse } from "tldts";

const BARE_HOST =
	/^(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z]{2,63}(?::\d{1,5})?(?:[/?#]\S*)?$/i;
const FILE_LOCATION = /(?::\d+:\d+|#L\d+(?:C\d+)?(?:-L?\d+(?:C\d+)?)?)$/;
const FILE_EXTENSION_TLDS = new Set(["md", "py", "rs", "sh", "tf", "zip"]);

export function bareWebUrl(text: string): string | null {
	const value = text.trim();
	if (!BARE_HOST.test(value) || FILE_LOCATION.test(value)) return null;
	let url: URL;
	try {
		url = new URL(`https://${value}`);
	} catch {
		return null;
	}
	const { isIcann, publicSuffix } = parse(url.hostname);
	if (!isIcann || !publicSuffix) return null;
	const topLevelDomain = publicSuffix.split(".").at(-1) ?? "";
	return FILE_EXTENSION_TLDS.has(topLevelDomain) ? null : url.href;
}
