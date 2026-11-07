import { useCallback, useState } from "react";

export interface LinkActionMenuRequest {
	id: number;
	url: string;
	clientX: number;
	clientY: number;
}

let nextRequestId = 0;

export function useLinkActionMenu() {
	const [menu, setMenu] = useState<LinkActionMenuRequest | null>(null);

	const showLinkMenu = useCallback(
		(url: string, clientX: number, clientY: number) => {
			nextRequestId += 1;
			setMenu({ id: nextRequestId, url, clientX, clientY });
		},
		[],
	);

	const closeLinkMenu = useCallback(() => setMenu(null), []);

	return { menu, showLinkMenu, closeLinkMenu };
}
