import { bareWebUrl } from "../../../../../ChatSession/utils/bareWebUrl";
import { type LocatedPath, locatePath } from "../locatePath";

export type ChatLinkTarget =
	| ({ kind: "path" } & LocatedPath)
	| { kind: "web"; url: string };

export async function locateChatLink(
	href: string,
	path: string,
	host: Parameters<typeof locatePath>[1],
): Promise<ChatLinkTarget | null> {
	const located = await locatePath(path, host);
	if (located) return { kind: "path", ...located };
	const url = bareWebUrl(href);
	return url ? { kind: "web", url } : null;
}
