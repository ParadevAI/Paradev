import type { MessageDescriptor } from "@lingui/core";

/** Where this build gets its update. `message` replaces the server's text, which is written for the App Store. */
export interface AppUpdate {
	message: MessageDescriptor | null;
	action: MessageDescriptor;
	open: () => void;
}
