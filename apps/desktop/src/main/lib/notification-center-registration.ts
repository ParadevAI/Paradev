import { Notification } from "electron";
import { PLATFORM } from "shared/constants";
import { getAppDisplayName } from "./app-display-name";

export function registerWithMacOSNotificationCenter() {
	if (!PLATFORM.IS_MAC || !Notification.isSupported()) return;

	const registrationNotification = new Notification({
		title: getAppDisplayName(),
		body: " ",
		silent: true,
	});

	let handled = false;
	const cleanup = () => {
		if (handled) return;
		handled = true;
		registrationNotification.close();
	};

	registrationNotification.on("show", () => {
		cleanup();
		console.log("[notifications] Registered with Notification Center");
	});

	// Fallback timeout in case macOS doesn't fire events
	setTimeout(cleanup, 1000);

	registrationNotification.show();
}
