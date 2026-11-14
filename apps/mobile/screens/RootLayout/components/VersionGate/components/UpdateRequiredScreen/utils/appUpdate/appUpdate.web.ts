import { msg } from "@lingui/core/macro";
import type { AppUpdate } from "./appUpdate.types";

export const appUpdate: AppUpdate = {
	message: msg({
		message: "A new version of Paradev is out. Reload to continue.",
	}),
	action: msg({ message: "Reload" }),
	open: () => window.location.reload(),
};
