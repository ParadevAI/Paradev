"use client";

import { Trans } from "@lingui/react/macro";
import { HiMiniArrowDownTray } from "react-icons/hi2";
import { DownloadLink } from "@/app/[lang]/components/DownloadLink";

interface CompareDownloadCTAProps {
	slug: string;
	placement: "hero" | "verdict";
}

export function CompareDownloadCTA({
	slug,
	placement,
}: CompareDownloadCTAProps) {
	return (
		<div className="flex flex-col items-center gap-3">
			<DownloadLink
				source="compare"
				properties={{ slug, placement }}
				className="group inline-flex items-center gap-2 bg-foreground px-6 py-3 text-base text-background transition-colors hover:bg-brand hover:text-white"
			>
				<Trans>Download Paradev</Trans>
				<span className="relative size-4 overflow-hidden">
					<HiMiniArrowDownTray className="size-4 transition-transform duration-300 ease-out group-hover:translate-y-full" />
					<HiMiniArrowDownTray className="absolute inset-0 size-4 -translate-y-full transition-transform duration-300 ease-out group-hover:translate-y-0" />
				</span>
			</DownloadLink>
			<p className="text-sm text-muted-foreground">
				<Trans>
					For macOS on Apple Silicon and Intel. Linux AppImage is experimental.
				</Trans>
			</p>
		</div>
	);
}
