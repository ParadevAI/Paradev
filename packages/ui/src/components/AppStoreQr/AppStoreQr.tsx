import { COMPANY } from "@superset/shared/constants";
import { renderSVG } from "uqr";
import { cn } from "../../lib/utils";

function renderQr(url: string) {
	return renderSVG(url, {
		border: 4,
		whiteColor: "#ffffff",
		blackColor: "#0b0b0b",
	});
}

const APP_STORE_QR_SVG = renderQr(COMPANY.APP_STORE_URL);

interface AppStoreQrProps {
	className?: string;
	label?: string;
	url?: string;
}

export function AppStoreQr({ className, label, url }: AppStoreQrProps) {
	return (
		<div
			role="img"
			aria-label={label}
			aria-hidden={label ? undefined : true}
			className={cn("shrink-0 bg-white [&>svg]:size-full", className)}
			// biome-ignore lint/security/noDangerouslySetInnerHtml: SVG generated from a URL the caller owns
			dangerouslySetInnerHTML={{
				__html: url ? renderQr(url) : APP_STORE_QR_SVG,
			}}
		/>
	);
}
