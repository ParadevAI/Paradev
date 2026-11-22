"use client";

import { COMPANY } from "@superset/shared/constants";
import { FaApple, FaGooglePlay } from "react-icons/fa";
import { track } from "@/lib/analytics";

const BADGE_LINK_CLASS =
	"flex h-12 items-center gap-2.5 bg-foreground px-4 font-medium text-[17px] text-background leading-none tracking-tight transition-colors hover:bg-brand hover:text-white";

interface StoreBadgesProps {
	source: string;
}

export function StoreBadges({ source }: StoreBadgesProps) {
	return (
		<div className="flex flex-wrap gap-3">
			<a
				href={COMPANY.APP_STORE_URL}
				target="_blank"
				rel="noopener noreferrer"
				onClick={() =>
					track("mobile_store_clicked", { store: "app_store", source })
				}
				className={BADGE_LINK_CLASS}
			>
				<FaApple className="size-6 shrink-0" />
				App Store
			</a>
			<a
				href={COMPANY.PLAY_STORE_URL}
				target="_blank"
				rel="noopener noreferrer"
				onClick={() =>
					track("mobile_store_clicked", { store: "google_play", source })
				}
				className={BADGE_LINK_CLASS}
			>
				<FaGooglePlay className="size-5 shrink-0" />
				Google Play
			</a>
		</div>
	);
}
