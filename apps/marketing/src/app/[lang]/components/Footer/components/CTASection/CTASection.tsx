"use client";

import { Trans, useLingui } from "@lingui/react/macro";
import { COMPANY } from "@superset/shared/constants";
import { useState } from "react";
import { FaGithub } from "react-icons/fa";
import { track } from "@/lib/analytics";
import { DownloadButton } from "../../../DownloadButton";
import { WaitlistModal } from "../../../WaitlistModal";

export function CTASection() {
	const { t } = useLingui();
	const [isWaitlistOpen, setIsWaitlistOpen] = useState(false);

	return (
		<>
			<section className="w-full py-14 [@media(max-height:800px)]:py-8">
				<div className="max-w-7xl mx-auto px-6 sm:px-8 flex flex-col items-center text-center">
					<h2 className="text-4xl sm:text-5xl lg:text-7xl lg:[@media(max-height:800px)]:text-6xl font-medium tracking-tight leading-[1.05] text-foreground mb-10 [@media(max-height:800px)]:mb-8">
						<Trans comment="Footer call to action. Use the natural idiom for clearing a work backlog fast, not a literal translation of “smash”.">
							Smash your backlog.
						</Trans>
					</h2>
					<div className="flex flex-wrap items-center justify-center gap-2 sm:gap-4">
						<DownloadButton
							source="footer"
							onJoinWaitlist={() => setIsWaitlistOpen(true)}
						/>
						<button
							type="button"
							className="px-4 py-2.5 sm:px-6 sm:py-3 text-sm sm:text-base font-normal bg-background border border-border text-foreground hover:bg-muted transition-colors flex items-center gap-2"
							onClick={() => {
								track("github_clicked", { source: "cta_section" });
								window.open(
									COMPANY.GITHUB_URL,
									"_blank",
									"noopener,noreferrer",
								);
							}}
							aria-label={t({
								message: "Star on GitHub",
							})}
						>
							<Trans>Star on GitHub</Trans>
							<FaGithub className="size-4" />
						</button>
					</div>
				</div>
			</section>
			<WaitlistModal
				isOpen={isWaitlistOpen}
				onClose={() => setIsWaitlistOpen(false)}
			/>
		</>
	);
}
