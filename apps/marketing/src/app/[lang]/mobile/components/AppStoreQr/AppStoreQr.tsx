import { COMPANY } from "@superset/shared/constants";
import { AppStoreQr as SharedAppStoreQr } from "@superset/ui/app-store-qr";

export function AppStoreQr() {
	return (
		<SharedAppStoreQr
			url={COMPANY.MOBILE_INSTALL_URL}
			className="hidden size-20 md:block"
		/>
	);
}
