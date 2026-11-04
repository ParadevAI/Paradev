export const NATIVE_MESSAGING_CHANNEL = "browser-extension-native-messaging";
export const NATIVE_MESSAGING_EVENT_CHANNEL =
	"browser-extension-native-messaging-event";

export type NativeMessagingOp = "connect" | "post" | "disconnect";

export type NativePortEvent =
	| { type: "message"; json: string }
	| { type: "disconnect"; error?: string };

/** Chrome's limit for one message from an extension, in UTF-8 bytes of JSON. */
export const MAX_EXTENSION_MESSAGE_LENGTH = 64 * 1024 * 1024;

export const NATIVE_MESSAGING_ERRORS = {
	invalidName: "Invalid native messaging host name specified.",
	notFound: "Specified native messaging host not found.",
	forbidden: "Access to the specified native messaging host is forbidden.",
	failedToStart: "Failed to start native messaging host.",
	exited: "Native host has exited.",
	io: "Error when communicating with the native messaging host.",
} as const;
