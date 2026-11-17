import { BRAND } from "@superset/shared/brand";
import type { DesktopNotice } from "@superset/shared/desktop-notices";

export const BRAND_RENAME_NOTICE_ID = `brand-rename-${BRAND.NAME}`;

interface BrandRenameNoticeContext {
	name: string;
	formerName: string;
	previousVersion: string | null;
	isDismissed: (id: string) => boolean;
}

export function shouldShowBrandRenameNotice({
	name,
	formerName,
	previousVersion,
	isDismissed,
}: BrandRenameNoticeContext): boolean {
	return (
		name !== formerName &&
		previousVersion !== null &&
		!isDismissed(BRAND_RENAME_NOTICE_ID)
	);
}

export function createBrandRenameNotice(): DesktopNotice {
	return {
		id: BRAND_RENAME_NOTICE_ID,
		severity: "info",
		trigger: "immediate",
		body: "",
		dismissible: true,
	};
}
