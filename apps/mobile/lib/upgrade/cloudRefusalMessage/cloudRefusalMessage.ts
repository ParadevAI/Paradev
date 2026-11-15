import { msg } from "@lingui/core/macro";
import { i18n } from "@superset/i18n";

/**
 * The API's own refusal text says where to upgrade, which the app may not
 * show outside the US storefront, so the app words it itself.
 */
export function cloudRefusalMessage(error: unknown): string | null {
	const key = (error as { data?: { i18nKey?: unknown } | null } | null)?.data
		?.i18nKey;
	if (key === "serverError.cloudWorkspace.cloudNeedsPaidPlan") {
		return i18n._(
			msg({ message: "Cloud workspaces are not included in your plan." }),
		);
	}
	if (key === "serverError.cloudWorkspace.usageLimitReached") {
		return i18n._(
			msg({ message: "Your organization reached its cloud usage limit." }),
		);
	}
	return null;
}
