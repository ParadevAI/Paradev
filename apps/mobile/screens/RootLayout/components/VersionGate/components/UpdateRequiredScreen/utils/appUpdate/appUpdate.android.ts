import { msg } from "@lingui/core/macro";
import * as Application from "expo-application";
import { openUrl } from "@/lib/open-url";
import type { AppUpdate } from "./appUpdate.types";

export const appUpdate: AppUpdate = {
	message: msg({ message: "Update Paradev from Google Play to continue." }),
	action: msg({ message: "Update on Google Play" }),
	open: () =>
		openUrl(
			`https://play.google.com/store/apps/details?id=${Application.applicationId}`,
		),
};
