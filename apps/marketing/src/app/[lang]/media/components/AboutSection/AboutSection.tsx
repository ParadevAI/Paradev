import { Trans } from "@lingui/react/macro";
import { BRAND } from "@superset/shared/brand";
import { COMPANY } from "@superset/shared/constants";
import { SectionHeading } from "../SectionHeading";

const productName = BRAND.NAME;
const formerName = BRAND.FORMER_NAME;
const companyName = COMPANY.LEGAL_NAME;
const isRenamed = BRAND.NAME !== BRAND.FORMER_NAME;

export function AboutSection() {
	return (
		<section aria-labelledby="about">
			<SectionHeading id="about">
				<Trans>About {productName}</Trans>
			</SectionHeading>
			<div className="mt-6 space-y-5 text-foreground text-lg leading-relaxed">
				<p>
					{isRenamed ? (
						<Trans>
							{productName} (formerly {formerName}, YC P26) is the
							source-available IDE for the AI agents era, where engineers run
							hundreds of coding agents like Claude Code and Codex in parallel.
						</Trans>
					) : (
						<Trans>
							{productName} (YC P26) is the source-available IDE for the AI
							agents era, where engineers run hundreds of coding agents like
							Claude Code and Codex in parallel.
						</Trans>
					)}{" "}
					<Trans>
						In under a year, more than 145,000 developers across 180 countries
						have run {productName} and created over 1.85 million agent
						workspaces.
					</Trans>{" "}
					<Trans>
						Japan is its second-largest market after the US, with over 13,000
						developers, and Asia as a whole now accounts for more users than the
						US.
					</Trans>{" "}
					<Trans>
						{productName} has been used by one in eight Fortune 500 companies.
					</Trans>{" "}
					<Trans>
						{productName} is used by engineers at Netflix, Microsoft, NVIDIA,
						DoorDash, Wix, and Mistral AI globally, and across Asia at
						ByteDance, Toss, Kakao, Grab, LINE, and Rakuten.
					</Trans>
				</p>
				<p>
					{isRenamed ? (
						<>
							<Trans>
								{companyName} makes {productName}.
							</Trans>{" "}
							<Trans>
								The company raised an $11.5M seed round led by Union Square
								Ventures, with Y Combinator and Paul Graham. TechCrunch named it
								one of the standout startups from YC Demo Day.
							</Trans>
						</>
					) : (
						<Trans>
							{productName} raised an $11.5M seed round led by Union Square
							Ventures, with Y Combinator and Paul Graham. TechCrunch named it
							one of the standout startups from YC Demo Day.
						</Trans>
					)}{" "}
					<Trans>
						On GitHub, it has 15k+ stars, 1,000+ forks, and 100+ contributors.
						It also hit #1 on Product Hunt.
					</Trans>
				</p>
			</div>
		</section>
	);
}
