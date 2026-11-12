export async function continueAcquisitionNavigation(
	prepare: () => Promise<unknown>,
	navigate: () => void,
	timeoutMs = 2500,
): Promise<void> {
	let timer: ReturnType<typeof setTimeout> | undefined;
	try {
		await Promise.race([
			prepare(),
			new Promise<void>((resolve) => {
				timer = setTimeout(resolve, timeoutMs);
			}),
		]);
	} catch {
	} finally {
		clearTimeout(timer);
		navigate();
	}
}

type LinkActivation = Pick<
	MouseEvent,
	| "type"
	| "button"
	| "defaultPrevented"
	| "altKey"
	| "ctrlKey"
	| "metaKey"
	| "shiftKey"
	| "preventDefault"
>;
type LinkTarget = Pick<HTMLAnchorElement, "href" | "target" | "hasAttribute">;
type Navigation = {
	prepare: () => Promise<unknown>;
	assign: (href: string) => void;
	open: () => Pick<Window, "opener" | "location" | "closed"> | null;
};

export function handleAcquisitionLink(
	event: LinkActivation,
	link: LinkTarget,
	webOrigin: string,
	navigation: Navigation,
): Promise<void> | undefined {
	if (event.defaultPrevented || event.altKey || link.hasAttribute("download"))
		return;
	if (event.type === "auxclick" ? event.button !== 1 : event.button !== 0)
		return;
	const target = link.target.toLowerCase();
	if (target && target !== "_self" && target !== "_blank") return;
	let href: URL;
	try {
		href = new URL(link.href);
		if (href.origin !== webOrigin) return;
	} catch {
		return;
	}
	const newTab =
		target === "_blank" ||
		event.button === 1 ||
		event.ctrlKey ||
		event.metaKey ||
		event.shiftKey;
	const tab = newTab ? navigation.open() : null;
	if (newTab && !tab) return;
	if (tab) tab.opener = null;
	event.preventDefault();
	return continueAcquisitionNavigation(navigation.prepare, () => {
		if (tab) {
			if (!tab.closed) tab.location.href = href.href;
		} else {
			navigation.assign(href.href);
		}
	});
}

export function installAcquisitionNavigation(
	webUrl: string,
	prepare: () => Promise<unknown>,
): void {
	const webOrigin = new URL(webUrl).origin;
	const activate = (event: MouseEvent) => {
		const link =
			event.target instanceof Element ? event.target.closest("a[href]") : null;
		if (!(link instanceof HTMLAnchorElement)) return;
		void handleAcquisitionLink(event, link, webOrigin, {
			prepare,
			assign: (href) => window.location.assign(href),
			open: () => window.open("about:blank", "_blank"),
		});
	};
	window.addEventListener("click", activate);
	window.addEventListener("auxclick", activate);
}
