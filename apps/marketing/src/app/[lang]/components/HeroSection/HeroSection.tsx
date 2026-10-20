"use client";

import { Trans, useLingui } from "@lingui/react/macro";
import { COMPANY } from "@superset/shared/constants";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { FaApple, FaGithub } from "react-icons/fa";
import { track } from "@/lib/analytics";
import { HEADLINE_VARIANTS, type HeadlineVariant } from "@/lib/hero-headline";
import { DownloadButton } from "../DownloadButton";
import { WaitlistModal } from "../WaitlistModal";
import { BoidsBackground } from "./components/BoidsBackground";
import { ProductDemo } from "./components/ProductDemo";
import { RiseHeadline } from "./components/RiseHeadline";
import { useHeadlineExposure } from "./hooks/useHeadlineExposure";

export function HeroSection() {
	const [isWaitlistOpen, setIsWaitlistOpen] = useState(false);
	const [isIOS, setIsIOS] = useState(false);

	useEffect(() => {
		setIsIOS(
			/iphone|ipad|ipod/i.test(navigator.userAgent) ||
				(/macintosh/i.test(navigator.userAgent) &&
					navigator.maxTouchPoints > 1),
		);
	}, []);
	const { t, i18n } = useLingui();

	const headlineRef = useRef<HTMLHeadingElement>(null);
	useHeadlineExposure(headlineRef);

	const headlines: Record<HeadlineVariant, [lead: string, emphasis: string]> = {
		control: [
			t({ message: "Bring Any Agent" }),
			t({ message: "Orchestrate Them All" }),
		],
		ide: [
			t({
				message: "The IDE for",
				comment:
					"Homepage headline, line 1 of 2. Line 2 is “Parallel Agents”; reorder the two lines if the language needs it.",
			}),
			t({
				message: "Parallel Agents",
				comment: "Homepage headline, line 2 of 2, after “The IDE for”.",
			}),
		],
		army: [
			t({
				message: "Run an Army of",
				comment:
					"Homepage headline, line 1 of 2. Line 2 is “Coding Agents”; reorder the two lines if the language needs it.",
			}),
			t({
				message: "Coding Agents",
				comment: "Homepage headline, line 2 of 2, after “Run an Army of”.",
			}),
		],
	};

	return (
		<div>
			<div className="relative flex flex-col items-center pt-24 sm:pt-32 lg:pt-40 pb-16 sm:pb-24 overflow-hidden">
				<BoidsBackground />
				<div className="relative w-full max-w-7xl mx-auto px-6 sm:px-8">
					<div className="flex flex-col items-center text-center">
						<Link
							href={
								i18n.locale === "en"
									? "/blog/a-new-name"
									: `/${i18n.locale}/blog/a-new-name`
							}
							className="group mb-6 sm:mb-8 inline-flex max-w-full items-center gap-2 rounded-[2px] border border-border bg-background/80 px-3 py-1.5 text-xs font-mono text-muted-foreground transition-colors hover:text-foreground hover:border-foreground/[0.2]"
						>
							<span
								aria-hidden="true"
								className="size-1.5 shrink-0 rounded-full bg-brand"
							/>
							<span>
								<Trans>Superset is getting a new name soon</Trans>
							</span>
							<span
								aria-hidden="true"
								className="shrink-0 transition-transform group-hover:translate-x-0.5"
							>
								→
							</span>
						</Link>
						<div className="space-y-4 sm:space-y-6">
							<h1
								ref={headlineRef}
								className="text-[min(2.25rem,8.6vw)] sm:text-5xl md:text-6xl lg:text-7xl font-medium tracking-tight leading-[1.1] [word-spacing:0.15em] whitespace-pre-line text-foreground relative max-w-6xl mx-auto"
							>
								{HEADLINE_VARIANTS.map((variant) => (
									<span key={variant} data-headline-variant={variant}>
										<RiseHeadline
											lead={headlines[variant][0]}
											emphasis={headlines[variant][1]}
										/>
									</span>
								))}
							</h1>
							<p
								id="hero-subheadline"
								className="text-base sm:text-xl font-light text-muted-foreground max-w-4xl mx-auto"
							>
								<Trans>
									One workspace for Claude Code, Codex, and any coding agent.
								</Trans>
							</p>
						</div>

						<div className="flex flex-wrap items-center justify-center gap-2 sm:gap-4 mt-6 sm:mt-8">
							<DownloadButton
								source="hero"
								onJoinWaitlist={() => setIsWaitlistOpen(true)}
							/>
							<Link
								href={
									isIOS
										? COMPANY.APP_STORE_URL
										: i18n.locale === "en"
											? "/mobile"
											: `/${i18n.locale}/mobile`
								}
								onClick={() =>
									isIOS
										? track("mobile_store_clicked", {
												store: "app_store",
												source: "hero",
											})
										: track("mobile_page_clicked", { source: "hero" })
								}
								aria-label={t({ message: "Superset for iPhone and iPad" })}
								className="flex size-11 shrink-0 items-center justify-center border border-border bg-background text-foreground transition-colors hover:bg-muted focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-brand sm:size-12"
							>
								<FaApple aria-hidden="true" className="size-5" />
							</Link>
							<button
								type="button"
								className="flex size-11 shrink-0 items-center justify-center border border-border bg-background text-foreground transition-colors hover:bg-muted focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-brand sm:size-12"
								onClick={() => {
									track("github_clicked", { source: "hero" });
									window.open(
										COMPANY.GITHUB_URL,
										"_blank",
										"noopener,noreferrer",
									);
								}}
								aria-label={t({
									message: "View on GitHub",
								})}
							>
								<FaGithub aria-hidden="true" className="size-5" />
							</button>
						</div>
					</div>

					<div className="relative w-full mt-20 sm:mt-32 lg:mt-40">
						<ProductDemo />
					</div>
				</div>
			</div>
			<WaitlistModal
				isOpen={isWaitlistOpen}
				onClose={() => setIsWaitlistOpen(false)}
			/>
		</div>
	);
}
