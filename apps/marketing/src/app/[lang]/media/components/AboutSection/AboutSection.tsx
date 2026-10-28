import { Trans } from "@lingui/react/macro";
import { BRAND } from "@superset/shared/brand";
import { COMPANY } from "@superset/shared/constants";
import type { ReactNode } from "react";
import { SectionHeading } from "../SectionHeading";

const productName = BRAND.NAME;
const formerName = BRAND.FORMER_NAME;
const companyName = COMPANY.LEGAL_NAME;
const isRenamed = BRAND.NAME !== BRAND.FORMER_NAME;

export function AboutSection() {
	const facts: { id: string; label: ReactNode; value: ReactNode }[] = [
		{
			id: "customers",
			label: <Trans>Customers</Trans>,
			value: (
				<>
					<Trans>
						{productName} has been used by one in eight Fortune 500 companies.
					</Trans>{" "}
					<Trans>
						{productName} is used by engineers at Netflix, Microsoft, NVIDIA,
						DoorDash, Wix, and Mistral AI globally, and across Asia at
						ByteDance, Toss, Kakao, Grab, LINE, and Rakuten.
					</Trans>
				</>
			),
		},
		{
			id: "asia",
			label: <Trans>Asia</Trans>,
			value: (
				<Trans>
					Japan is its second-largest market after the US, with over 13,000
					developers, and Asia as a whole now accounts for more users than the
					US.
				</Trans>
			),
		},
		{
			id: "funding",
			label: <Trans>Funding</Trans>,
			value: isRenamed ? (
				<>
					<Trans>
						{companyName} makes {productName}.
					</Trans>{" "}
					<Trans>
						The company raised an $11.5M seed round led by Union Square
						Ventures, with Y Combinator and Paul Graham. TechCrunch named it one
						of the standout startups from YC Demo Day.
					</Trans>
				</>
			) : (
				<Trans>
					{productName} raised an $11.5M seed round led by Union Square
					Ventures, with Y Combinator and Paul Graham. TechCrunch named it one
					of the standout startups from YC Demo Day.
				</Trans>
			),
		},
		{
			id: "github",
			label: <Trans>GitHub</Trans>,
			value: (
				<Trans>
					On GitHub, it has 15k+ stars, 1,000+ forks, and 100+ contributors. It
					also hit #1 on Product Hunt.
				</Trans>
			),
		},
	];

	return (
		<section aria-labelledby="about">
			<SectionHeading id="about">
				<Trans>About {productName}</Trans>
			</SectionHeading>
			<p className="mt-6 text-foreground text-xl leading-relaxed">
				{isRenamed ? (
					<Trans>
						{productName} (formerly {formerName}, YC P26) is the
						source-available IDE for the AI agents era, where engineers run
						hundreds of coding agents like Claude Code and Codex in parallel.
					</Trans>
				) : (
					<Trans>
						{productName} (YC P26) is the source-available IDE for the AI agents
						era, where engineers run hundreds of coding agents like Claude Code
						and Codex in parallel.
					</Trans>
				)}{" "}
				<Trans>
					In under a year, more than 145,000 developers across 180 countries
					have run {productName} and created over 1.85 million agent workspaces.
				</Trans>
			</p>
			<dl className="mt-8 divide-y divide-border border-border border-y">
				{facts.map((fact) => (
					<div
						key={fact.id}
						className="grid gap-1 py-4 sm:grid-cols-[10rem_1fr] sm:gap-6"
					>
						<dt className="font-mono text-muted-foreground text-xs uppercase tracking-wider sm:pt-1">
							{fact.label}
						</dt>
						<dd className="text-muted-foreground leading-relaxed">
							{fact.value}
						</dd>
					</div>
				))}
			</dl>
		</section>
	);
}
