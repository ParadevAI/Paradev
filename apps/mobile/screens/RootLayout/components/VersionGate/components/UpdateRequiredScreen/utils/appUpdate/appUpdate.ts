import { msg } from "@lingui/core/macro";
import { COMPANY } from "@superset/shared/constants";
import { openUrl } from "@/lib/open-url";
import type { AppUpdate } from "./appUpdate.types";

export const appUpdate: AppUpdate = {
	message: null,
	action: msg({ message: "Update in the App Store" }),
	open: () => openUrl(COMPANY.APP_STORE_URL),
};
