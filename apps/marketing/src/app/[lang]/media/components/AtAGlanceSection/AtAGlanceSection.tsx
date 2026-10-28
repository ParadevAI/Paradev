import { Trans } from "@lingui/react/macro";
import { BRAND } from "@superset/shared/brand";
import { COMPANY } from "@superset/shared/constants";
import type { ReactNode } from "react";
import { getAllPeople } from "@/lib/people";
import { SectionHeading } from "../SectionHeading";
import { CopyButton } from "./components/CopyButton";

const productName = BRAND.NAME;
const formerName = BRAND.FORMER_NAME;
const companyName = COMPANY.LEGAL_NAME;
const isRenamed = BRAND.NAME !== BRAND.FORMER_NAME;
const websiteHost = new URL(COMPANY.MARKETING_URL).host;

export function AtAGlanceSection() {
	const founders = getAllPeople()
		.filter((person) => person.role.toLowerCase().startsWith("cofounder"))
		.map(
			(person) =>
				`${person.name}, ${person.role.replace(/^cofounder and /i, "")}`,
		)
		.join(" · ");

	const facts: { id: string; label: ReactNode; value: ReactNode }[] = [
		{
			id: "product",
			label: <Trans>Product</Trans>,
			value: isRenamed ? (
				<Trans>
					{productName} (formerly {formerName})
				</Trans>
			) : (
				productName
			),
		},
		{ id: "company", label: <Trans>Company</Trans>, value: companyName },
		{ id: "yc", label: <Trans>Y Combinator batch</Trans>, value: "P26" },
		{
			id: "headquarters",
			label: <Trans>Headquarters</Trans>,
			value: "San Francisco",
		},
		{ id: "founders", label: <Trans>Founders</Trans>, value: founders },
		{
			id: "funding",
			label: <Trans>Funding</Trans>,
			value: <Trans>$11.5M seed led by Union Square Ventures</Trans>,
		},
		{
			id: "developers",
			label: <Trans>Developers</Trans>,
			value: <Trans>145,000+ across 180 countries</Trans>,
		},
		{
			id: "github",
			label: <Trans>GitHub</Trans>,
			value: <Trans>15k+ stars, 100+ contributors</Trans>,
		},
		{
			id: "website",
			label: <Trans>Website</Trans>,
			value: (
				<a
					href={COMPANY.MARKETING_URL}
					className="text-foreground underline-offset-4 hover:underline"
				>
					{websiteHost}
				</a>
			),
		},
		{
			id: "press",
			label: <Trans>Press</Trans>,
			value: (
				<a
					href={COMPANY.FOUNDERS_MAIL_TO}
					className="text-foreground underline-offset-4 hover:underline"
				>
					{COMPANY.FOUNDERS_EMAIL}
				</a>
			),
		},
	];

	return (
		<section aria-labelledby="at-a-glance">
			<SectionHeading id="at-a-glance">
				<Trans>At a glance</Trans>
			</SectionHeading>
			<dl className="divide-y divide-border">
				{facts.map((fact) => (
					<div
						key={fact.id}
						className="grid gap-1 py-3 sm:grid-cols-[12rem_1fr] sm:gap-6"
					>
						<dt className="font-mono text-muted-foreground text-xs uppercase tracking-wider sm:pt-0.5">
							{fact.label}
						</dt>
						<dd className="text-foreground">{fact.value}</dd>
					</div>
				))}
			</dl>

			<div className="mt-10 space-y-6">
				<div className="border border-border">
					<div className="flex items-center justify-between border-border border-b px-4 py-2.5">
						<p className="font-mono text-muted-foreground text-xs uppercase tracking-wider">
							<Trans>One line</Trans>
						</p>
						<CopyButton targetId="boilerplate-short" />
					</div>
					<p
						id="boilerplate-short"
						className="px-4 py-4 text-foreground leading-relaxed"
					>
						{isRenamed ? (
							<Trans>
								{productName} (formerly {formerName}, YC P26) is the
								source-available IDE for the AI agents era, where engineers run
								hundreds of coding agents like Claude Code and Codex in
								parallel.
							</Trans>
						) : (
							<Trans>
								{productName} (YC P26) is the source-available IDE for the AI
								agents era, where engineers run hundreds of coding agents like
								Claude Code and Codex in parallel.
							</Trans>
						)}
					</p>
				</div>
				<div className="border border-border">
					<div className="flex items-center justify-between border-border border-b px-4 py-2.5">
						<p className="font-mono text-muted-foreground text-xs uppercase tracking-wider">
							<Trans>One paragraph</Trans>
						</p>
						<CopyButton targetId="boilerplate-long" />
					</div>
					<div
						id="boilerplate-long"
						className="space-y-4 px-4 py-4 text-muted-foreground leading-relaxed"
					>
						<p>
							{isRenamed ? (
								<Trans>
									{productName} (formerly {formerName}, YC P26) is the
									source-available IDE for the AI agents era, where engineers
									run hundreds of coding agents like Claude Code and Codex in
									parallel.
								</Trans>
							) : (
								<Trans>
									{productName} (YC P26) is the source-available IDE for the AI
									agents era, where engineers run hundreds of coding agents like
									Claude Code and Codex in parallel.
								</Trans>
							)}{" "}
							<Trans>
								In under a year, more than 145,000 developers across 180
								countries have run {productName} and created over 1.85 million
								agent workspaces.
							</Trans>
						</p>
						<p>
							<Trans>
								{productName} has been used by one in eight Fortune 500
								companies.
							</Trans>{" "}
							<Trans>
								{productName} is used by engineers at Netflix, Microsoft,
								NVIDIA, DoorDash, Wix, and Mistral AI globally, and across Asia
								at ByteDance, Toss, Kakao, Grab, LINE, and Rakuten.
							</Trans>{" "}
							<Trans>
								Japan is its second-largest market after the US, with over
								13,000 developers, and Asia as a whole now accounts for more
								users than the US.
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
										Ventures, with Y Combinator and Paul Graham. TechCrunch
										named it one of the standout startups from YC Demo Day.
									</Trans>
								</>
							) : (
								<Trans>
									{productName} raised an $11.5M seed round led by Union Square
									Ventures, with Y Combinator and Paul Graham. TechCrunch named
									it one of the standout startups from YC Demo Day.
								</Trans>
							)}{" "}
							<Trans>
								On GitHub, it has 15k+ stars, 1,000+ forks, and 100+
								contributors. It also hit #1 on Product Hunt.
							</Trans>
						</p>
					</div>
				</div>
			</div>
		</section>
	);
}
