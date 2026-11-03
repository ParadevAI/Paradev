import { msg } from "@lingui/core/macro";
import { i18n } from "@superset/i18n";
import { BrowserWindow } from "electron";
import { confirm } from "./confirm-dialog";
import { extensionIcon } from "./extension-icon";
import { accessDetail, addedAccess } from "./install-warnings";

/** Chrome asks before `permissions.request` grants optional access; this asks the same way. */
export function confirmPermissionRequest(
	extension: Electron.Extension,
	request: chrome.permissions.Permissions,
): Promise<boolean> {
	const name = extension.name;
	const added = addedAccess(
		{},
		{ permissions: request.permissions, host_permissions: request.origins },
	);
	return confirm(BrowserWindow.getFocusedWindow() ?? undefined, {
		icon: extensionIcon(extension.path, extension.manifest),
		buttons: [
			i18n._(msg({ message: "Allow" })),
			i18n._(msg({ message: "Don't allow" })),
		],
		message: i18n._(msg({ message: `${name} wants more access` })),
		detail: accessDetail(i18n._(msg({ message: "It can:" })), added),
	});
}
