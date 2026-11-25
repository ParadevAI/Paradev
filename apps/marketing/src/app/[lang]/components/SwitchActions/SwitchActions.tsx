"use client";

import { Trans } from "@lingui/react/macro";
import { useState } from "react";
import { DownloadButton } from "@/app/[lang]/components/DownloadButton";
import { WaitlistModal } from "@/app/[lang]/components/WaitlistModal";
import type { DownloadSource } from "@/lib/analytics";

interface SwitchActionsProps {
	placement: "hero" | "footer";
	source: DownloadSource;
	guideUrl: string;
}

export function SwitchActions({
	placement,
	source,
	guideUrl,
}: SwitchActionsProps) {
	const [isWaitlistOpen, setIsWaitlistOpen] = useState(false);

	return (
		<>
			<div className="mt-8 flex flex-wrap items-center gap-3">
				<DownloadButton
					source={source}
					onJoinWaitlist={() => setIsWaitlistOpen(true)}
				/>
				{placement === "hero" ? (
					<a
						href="#migrate"
						className="border border-border px-4 py-2 text-foreground text-sm transition-colors hover:bg-muted sm:px-6 sm:py-3 sm:text-base"
					>
						<Trans>See migration steps</Trans>
					</a>
				) : (
					<a
						href={guideUrl}
						className="border border-border px-4 py-2 text-foreground text-sm transition-colors hover:bg-muted sm:px-6 sm:py-3 sm:text-base"
					>
						<Trans>Read the migration guide</Trans>
					</a>
				)}
			</div>
			<WaitlistModal
				isOpen={isWaitlistOpen}
				onClose={() => setIsWaitlistOpen(false)}
			/>
		</>
	);
}
