"use client";

import { Trans } from "@lingui/react/macro";
import { useState } from "react";
import { DownloadButton } from "@/app/[lang]/components/DownloadButton";
import { WaitlistModal } from "@/app/[lang]/components/WaitlistModal";
import { MIGRATE_LOCAL_URL } from "../../constants";

interface SwitchActionsProps {
	placement: "hero" | "footer";
}

export function SwitchActions({ placement }: SwitchActionsProps) {
	const [isWaitlistOpen, setIsWaitlistOpen] = useState(false);

	return (
		<>
			<div className="mt-8 flex flex-wrap items-center gap-3">
				<DownloadButton
					source="conductor"
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
						href={MIGRATE_LOCAL_URL}
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
