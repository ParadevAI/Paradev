"use client";

import { Trans } from "@lingui/react/macro";
import { DOWNLOAD_URL_MAC_X64 } from "@superset/shared/constants";
import { type ArchSource, Platform } from "@/app/[lang]/hooks/useOS";
import { track } from "@/lib/analytics";
import { desktopUrlFor } from "../../utils/desktopUrlFor";

const LINK_CLASS =
	"text-foreground underline-offset-4 transition-colors hover:underline";

interface DownloadFallbackProps {
	platform: Platform;
	archSource: ArchSource;
}

export function DownloadFallback({
	platform,
	archSource,
}: DownloadFallbackProps) {
	const offerIntel =
		platform === Platform.MacAppleSilicon || platform === Platform.Unknown;

	return (
		<p className="flex flex-wrap items-center justify-center gap-x-3 gap-y-1 text-muted-foreground text-sm">
			<span>
				<Trans>Download didn't start?</Trans>
			</span>
			<a
				href={desktopUrlFor(platform)}
				onClick={() => {
					track("download_manual_clicked", { platform });
					track("download_started", { platform, trigger: "manual" });
				}}
				className={LINK_CLASS}
			>
				<Trans>Download again</Trans>
			</a>
			{offerIntel ? (
				<>
					<span aria-hidden="true">·</span>
					<a
						href={DOWNLOAD_URL_MAC_X64}
						onClick={() =>
							track("download_arch_switched", { platform, archSource })
						}
						className={LINK_CLASS}
					>
						<Trans>Intel Mac</Trans>
					</a>
				</>
			) : null}
			<span aria-hidden="true">·</span>
			<a href="#all-downloads" className={LINK_CLASS}>
				<Trans>All downloads</Trans>
			</a>
		</p>
	);
}
