"use client";

import { Trans } from "@lingui/react/macro";
import { COMPANY } from "@superset/shared/constants";
import { FaApple, FaGooglePlay } from "react-icons/fa";
import { track } from "@/lib/analytics";

const BADGE_CLASS =
	"flex h-12 items-center gap-2.5 px-4 text-left transition-colors";
const BADGE_KICKER_CLASS = "block text-[10px] leading-none";
const BADGE_STORE_CLASS =
	"mt-1 block font-medium text-[17px] leading-none tracking-tight";

const BADGE_LINK_CLASS = `${BADGE_CLASS} bg-foreground text-background hover:bg-brand hover:text-white`;

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
				<span>
					<Trans>
						<span className={BADGE_KICKER_CLASS}>Download on the</span>
						<span className={BADGE_STORE_CLASS}>App Store</span>
					</Trans>
				</span>
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
				<span>
					<Trans>
						<span className={BADGE_KICKER_CLASS}>Get it on</span>
						<span className={BADGE_STORE_CLASS}>Google Play</span>
					</Trans>
				</span>
			</a>
		</div>
	);
}
