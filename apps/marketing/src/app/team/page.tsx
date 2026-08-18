import { ArrowRight } from "lucide-react";
import type { Metadata } from "next";
import { Micro_5 } from "next/font/google";
import Image from "next/image";
import Link from "next/link";
import {
	RiGithubFill,
	RiLinkedinBoxFill,
	RiTwitterXFill,
} from "react-icons/ri";
import { getAllPeople } from "@/lib/people";
import { CTASection } from "../components/CTASection";
import { TeamBio } from "./components/TeamBio";

// Loaded here instead of the root layout so other pages don't preload it
const micro5 = Micro_5({
	weight: "400",
	subsets: ["latin"],
	variable: "--font-micro5",
	display: "swap",
});

export const metadata: Metadata = {
	title: "About",
	description:
		"What Superset is, who builds it, and who it's for. A San Francisco team of three ex-YC CTOs building the workspace for parallel coding agents.",
	alternates: {
		canonical: "/team",
	},
	openGraph: {
		title: "About | Superset",
		description:
			"Meet the team behind Superset, building parallel coding agents for developers.",
		url: "/team",
		images: ["/opengraph-image"],
	},
	twitter: {
		card: "summary_large_image",
		title: "About | Superset",
		description:
			"Meet the team behind Superset, building parallel coding agents for developers.",
		images: ["/opengraph-image"],
	},
};

const MILESTONES = [
	{
		date: "Nov 2025",
		title: "The hackathon",
		description:
			"Superset starts as a hackathon project at YC HQ: a simple desktop app for managing worktrees.",
	},
	{
		date: "May 2026",
		title: "Public launch",
		description:
			"Superset launches publicly. Engineers running parallel agents finally have one place to run them.",
	},
	{
		date: "Jul 2026",
		title: "$11M seed",
		description:
			"Raised from the best investors in Silicon Valley to build the platform for software factories.",
	},
	{
		date: "Next",
		title: "100 agents",
		description:
			"The goal for 2026: one developer, 100 agents running in parallel.",
		href: "/blog/roadmap-to-100-agents",
	},
];

const PRINCIPLES = [
	{
		title: "Built in Superset",
		description:
			"We're our own #1 users. Every feature ships through the same worktrees, agents, and automations we ask you to trust, so we feel our own bugs before you do.",
	},
	{
		title: "Small and in person",
		description:
			"A flat, talent-dense team in one room in San Francisco. No managers, no handoffs, no waiting for a meeting to decide.",
	},
	{
		title: "Fun is the strategy",
		description:
			"We want to create the best team that has fun working together. Success will be a lagging indicator.",
	},
];

const FACTS = [
	{
		term: "Founded",
		definition: "November 2025, San Francisco",
	},
	{
		term: "License",
		definition: "Source-available on GitHub under Elastic License 2.0",
	},
	{
		term: "Platforms",
		definition:
			"macOS desktop app, experimental Linux AppImage, plus a CLI, TypeScript SDK, and MCP server",
	},
	{
		term: "Agents",
		definition:
			"Any CLI agent: Claude Code, Codex, OpenCode, Gemini, Copilot, and more",
	},
	{
		term: "Pricing",
		definition: "Free tier plus paid seats; your API keys, never proxied",
	},
	{
		term: "Not to be confused with",
		definition: "Apache Superset, the unrelated business-intelligence tool",
	},
];

export default function TeamPage() {
	const people = getAllPeople();

	return (
		<main className={`relative min-h-screen bg-background ${micro5.variable}`}>
			<div className="max-w-5xl mx-auto px-6 py-24 md:py-32">
				{/* Hero */}
				<section className="mb-24 md:mb-32">
					<p className="font-mono text-xs uppercase tracking-[0.2em] text-muted-foreground mb-6">
						About Superset
					</p>
					<h1 className="text-4xl sm:text-5xl md:text-6xl font-normal leading-[1.05] text-foreground max-w-4xl mb-8">
						Building the last piece of software.
						<br />
						<span className="text-muted-foreground">
							Give teams the tools to build software that improves itself.
						</span>
					</h1>
					<p className="text-lg md:text-xl text-muted-foreground leading-relaxed max-w-2xl">
						Superset is the workspace for parallel coding agents: Claude Code,
						Codex, or any CLI agent, each in its own isolated worktree. It's
						built by three ex-YC CTOs in San Francisco, for the way we work
						ourselves.
					</p>
				</section>

				{/* Our Story */}
				<section className="mb-24 md:mb-32">
					<div className="grid grid-cols-1 md:grid-cols-2 gap-10 md:gap-16 items-start">
						<div>
							<h2 className="text-2xl md:text-3xl font-normal text-foreground mb-6">
								From worktree manager to software factories
							</h2>
							<div className="space-y-4 text-muted-foreground leading-relaxed">
								<p>
									Superset started as a hackathon project in November 2025. It
									was a simple desktop app for managing worktrees.
								</p>
								<p>
									In just a few months,{" "}
									<span className="text-foreground">
										tens of thousands of engineers
									</span>{" "}
									run Superset as their primary IDE, at companies like Wix,
									DoorDash, and Netflix.
								</p>
								<p>
									Now, we've raised{" "}
									<span className="text-foreground">$11M</span> from the best
									investors in Silicon Valley to build the platform for software
									factories.
								</p>
							</div>
						</div>
						<figure className="m-0 md:sticky md:top-24">
							<div className="relative aspect-[8/5] rounded-lg overflow-hidden bg-muted border border-border">
								<Image
									src="/join-us/founders.jpg"
									alt="The Superset founders at a hackathon, YC HQ San Francisco"
									fill
									className="object-cover"
									sizes="(max-width: 768px) 100vw, 480px"
								/>
							</div>
							<figcaption className="mt-3 text-xs text-muted-foreground">
								The founders at the hackathon where Superset started{" "}
								<span className="text-muted-foreground/40">|</span> YC HQ,
								November 2025
							</figcaption>
						</figure>
					</div>
				</section>

				{/* Timeline */}
				<section className="mb-24 md:mb-32">
					<div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-x-8 gap-y-10">
						{MILESTONES.map((milestone) => (
							<div key={milestone.date} className="border-t border-border pt-5">
								<p
									className="text-2xl md:text-3xl text-foreground mb-3 tracking-wide uppercase"
									style={{ fontFamily: "var(--font-micro5)" }}
								>
									{milestone.date}
								</p>
								<h3 className="text-base font-medium text-foreground mb-2">
									{milestone.title}
								</h3>
								<p className="text-sm text-muted-foreground leading-relaxed">
									{milestone.description}
								</p>
								{milestone.href && (
									<Link
										href={milestone.href}
										className="mt-3 inline-flex items-center gap-1.5 text-sm text-foreground hover:text-foreground/80 transition-colors group"
									>
										Read the plan
										<ArrowRight className="size-3.5 transition-transform group-hover:translate-x-1" />
									</Link>
								)}
							</div>
						))}
					</div>
				</section>

				{/* How We Work */}
				<section className="mb-24 md:mb-32">
					<h2 className="text-2xl md:text-3xl font-normal text-foreground mb-10">
						How we work
					</h2>
					<div className="grid grid-cols-1 md:grid-cols-3 gap-x-8 gap-y-10">
						{PRINCIPLES.map((principle) => (
							<div key={principle.title}>
								<h3 className="text-base font-medium text-foreground mb-2">
									{principle.title}
								</h3>
								<p className="text-sm text-muted-foreground leading-relaxed">
									{principle.description}
								</p>
							</div>
						))}
					</div>
				</section>

				{/* Founders Grid */}
				<section className="mb-24 md:mb-32">
					<h2 className="text-2xl md:text-3xl font-normal text-foreground mb-10">
						The founders
					</h2>
					{people.length === 0 ? (
						<p className="text-muted-foreground">No team members yet.</p>
					) : (
						<div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-12 md:gap-10">
							{people.map((person) => {
								const initials = person.name
									.split(" ")
									.map((n) => n[0])
									.join("")
									.toUpperCase()
									.slice(0, 2);

								return (
									<article
										key={person.id}
										className="flex flex-col items-center text-center"
									>
										<Link href={`/team/${person.id}`} className="mb-5">
											<div className="relative size-32 md:size-36 rounded-full overflow-hidden bg-muted grayscale hover:grayscale-0 transition-all duration-300">
												{person.avatar ? (
													<Image
														src={person.avatar}
														alt={person.name}
														fill
														className="object-cover"
														sizes="144px"
													/>
												) : (
													<div className="absolute inset-0 flex items-center justify-center text-2xl font-medium text-foreground/30">
														{initials}
													</div>
												)}
											</div>
										</Link>

										<Link href={`/team/${person.id}`}>
											<h3 className="text-xl font-medium text-foreground hover:text-foreground/80 transition-colors">
												{person.name}
											</h3>
										</Link>
										<p className="text-sm text-muted-foreground mt-1">
											{person.role}
										</p>
										{person.bio && (
											<TeamBio
												bio={person.bio}
												className="text-sm text-muted-foreground leading-relaxed mt-3 [&_a]:text-muted-foreground [&_a]:underline [&_a]:underline-offset-2 [&_a]:hover:text-foreground"
											/>
										)}

										<div className="flex items-center gap-4 mt-4">
											{person.github && (
												<a
													href={`https://github.com/${person.github}`}
													target="_blank"
													rel="noopener noreferrer"
													className="text-muted-foreground hover:text-foreground transition-colors"
												>
													<RiGithubFill className="size-5" />
												</a>
											)}
											{person.linkedin && (
												<a
													href={`https://linkedin.com/in/${person.linkedin}`}
													target="_blank"
													rel="noopener noreferrer"
													className="text-muted-foreground hover:text-foreground transition-colors"
												>
													<RiLinkedinBoxFill className="size-5" />
												</a>
											)}
											{person.twitter && (
												<a
													href={`https://twitter.com/${person.twitter}`}
													target="_blank"
													rel="noopener noreferrer"
													className="text-muted-foreground hover:text-foreground transition-colors"
												>
													<RiTwitterXFill className="size-5" />
												</a>
											)}
										</div>
									</article>
								);
							})}
						</div>
					)}
					<div className="mt-14 text-center">
						<Link
							href="/join-us"
							className="inline-flex items-center gap-2 text-foreground hover:text-foreground/80 transition-colors group"
						>
							We're hiring in San Francisco
							<ArrowRight className="size-4 transition-transform group-hover:translate-x-1" />
						</Link>
					</div>
				</section>

				{/* Superset at a Glance */}
				<section>
					<h2 className="text-2xl md:text-3xl font-normal text-foreground mb-8">
						Superset at a glance
					</h2>
					<dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-10 gap-y-6 max-w-2xl text-sm">
						{FACTS.map((fact) => (
							<div key={fact.term}>
								<dt className="text-foreground font-medium mb-1">
									{fact.term}
								</dt>
								<dd className="text-muted-foreground">{fact.definition}</dd>
							</div>
						))}
					</dl>
				</section>
			</div>

			<CTASection />
		</main>
	);
}
