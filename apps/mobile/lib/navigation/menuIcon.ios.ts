import type { MenuIcon, MenuIconName, MenuIconSource } from "./menuIcon.types";

const SF_SYMBOL: Record<MenuIconName, MenuIconSource> = {
	archive: "archivebox",
	collection: "square.stack",
	copy: "doc.on.doc",
	delete: "trash",
	info: "info.circle",
	markUnread: "bell.badge",
	openExternal: "arrow.up.right.square",
	openLink: "arrow.up.right",
	pin: "pin",
	private: "lock",
	rename: "pencil",
	share: "square.and.arrow.up",
	team: "globe",
	unpin: "pin.slash",
};

export const menuIcon: MenuIcon = (name) => SF_SYMBOL[name];
