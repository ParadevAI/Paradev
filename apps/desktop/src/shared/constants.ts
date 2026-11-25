import {
	ACCEPTED_PROTOCOL_SCHEMES,
	PROTOCOL_SCHEMES,
} from "@superset/shared/constants";
import { getWorkspaceName } from "./env.shared";

export const PLATFORM = {
	IS_MAC: process.platform === "darwin",
	IS_WINDOWS: process.platform === "win32",
	IS_LINUX: process.platform === "linux",
};

const workspace = getWorkspaceName();
export const PROTOCOL_SCHEME = workspace
	? `superset-${workspace}`
	: PROTOCOL_SCHEMES.PROD;
/** A dev build claims only its own scheme so it never takes links from the installed app. */
export const REGISTERED_PROTOCOL_SCHEMES: readonly string[] = workspace
	? [PROTOCOL_SCHEME]
	: ACCEPTED_PROTOCOL_SCHEMES;
export const DEEP_LINK_SCHEMES: readonly string[] = [
	...new Set([PROTOCOL_SCHEME, ...ACCEPTED_PROTOCOL_SCHEMES]),
];
/** Height of the Windows/Linux window-controls overlay the window opens with. */
export const TITLE_BAR_OVERLAY_HEIGHT = 40;

// Separate sessions keep browser-pane extensions away from the app's own requests.
export const APP_PARTITION = "persist:superset";
export const BROWSER_PARTITION = "persist:browser";

export const NOTIFICATION_EVENTS = {
	FOCUS_NOTIFICATION_SOURCE: "focus-v2-notification-source",
	SETTINGS_EXTERNAL_CHANGE: "settings-external-change",
	OPEN_ROUTE: "open-route",
	NOTIFICATION_REPLY: "notification-reply",
} as const;

// Development/testing mock values (used when SKIP_ENV_VALIDATION is set)
export const MOCK_ORG_ID = "mock-org-id";

// Terminal defaults
export const DEFAULT_TERMINAL_SCROLLBACK = 5000;

// Hidden (parked) xterm instances kept fully alive before LRU eviction. (SUPER-1545)
import {
	DEFAULT_TERMINAL_PARKED_RUNTIME_CAP as SHARED_DEFAULT_PARKED_CAP,
	TERMINAL_PARKED_RUNTIME_CAP_LIMITS,
} from "@superset/shared/settings-constraints";

export const DEFAULT_TERMINAL_PARKED_RUNTIME_CAP = SHARED_DEFAULT_PARKED_CAP;
export const MIN_TERMINAL_PARKED_RUNTIME_CAP =
	TERMINAL_PARKED_RUNTIME_CAP_LIMITS.min;
export const MAX_TERMINAL_PARKED_RUNTIME_CAP =
	TERMINAL_PARKED_RUNTIME_CAP_LIMITS.max;

// Default user preference values
export const DEFAULT_CONFIRM_ON_QUIT = true;
export const DEFAULT_TERMINAL_COPY_ON_SELECT = false;
export const DEFAULT_FILE_AUTO_SAVE = "off" as const;
export const DEFAULT_WAIT_FOR_SETUP_BEFORE_AGENT = false;
export const DEFAULT_SHOW_RESOURCE_MONITOR = true;
export const DEFAULT_EXPOSE_HOST_SERVICE_VIA_RELAY = false;
