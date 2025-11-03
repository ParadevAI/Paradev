"use client";

import { Card } from "@superset/ui/card";
import { motion } from "framer-motion";
import type { ReactNode } from "react";
import { Footer } from "@/components/Footer";
import { Header } from "@/components/Header";
import { FadeUp } from "@/components/motion/FadeUp";
import { HeroParallax } from "@/components/motion/HeroParallax";
import { TiltCard } from "@/components/motion/TiltCard";
import { HeroCanvas } from "@/components/three/HeroCanvas";

// Client logos data
const CLIENT_LOGOS = [
	{ name: "numbies", logo: "numbies.xyz" },
	{ name: "cadra", logo: "Cadra" },
	{ name: "onlook", logo: "Onlook" },
	{ name: "amazon", logo: "Amazon" },
	{ name: "google", logo: "Google" },
	{ name: "servicenow", logo: "ServiceNow" },
	{ name: "ycombinator", logo: "Y Combinator" },
	{ name: "scribe", logo: "Scribe" },
] as const;

// Scale features data
const SCALE_FEATURES = [
	{
		title: "Build at the speed of thought",
		description: "Run multiple agents in parallel to experiment and build features as quickly as you can come up with them.",
		link: "Learn more",
	},
	{
		title: "No deadtime",
		description: "Code on the go using always-on agents that work even when you're away from your laptop.",
		link: "Learn more",
	},
	{
		title: "Zero switching cost",
		description:
			"As the human in the loop, we handle the port switching and context management so you're never overloaded.",
		link: "Learn more",
	},
] as const;

// Hero section component
function HeroSection() {
	return (
		<HeroParallax className="relative min-h-screen flex items-center justify-center overflow-hidden pointer-events-none">
			<div className="absolute inset-0 z-0">
				<HeroCanvas className="w-full h-full" />
				<div className="absolute inset-0 bg-linear-to-b from-black/0 via-black/30 to-black" />
			</div>

			<div className="relative z-10 px-4 sm:px-8 text-center text-white flex flex-col items-center justify-center gap-2 sm:gap-4 mt-[20rem] sm:mt-[30rem]">
				<FadeUp>
					<h1 className="text-[4rem] sm:text-[8rem] md:text-[10rem] lg:text-[14rem] font-bold leading-none -mt-8 sm:-mt-16">
						Superset
					</h1>
				</FadeUp>
				<FadeUp delay={0.2}>
					<h2 className="text-lg sm:text-xl md:text-2xl font-thin px-4">
						The last developer tool you'll ever need
					</h2>
				</FadeUp>
			</div>
		</HeroParallax>
	);
}

// Feature card component
interface FeatureCardProps {
	title: string;
	description: string;
	delay: number;
}

function FeatureCard({ title, description, delay }: FeatureCardProps) {
	return (
		<FadeUp delay={delay}>
			<TiltCard>
				<Card className="p-8 h-full hover:shadow-2xl transition-shadow bg-zinc-900 border-zinc-800">
					<h3 className="text-2xl font-semibold mb-4 text-white">{title}</h3>
					<p className="text-zinc-400">{description}</p>
				</Card>
			</TiltCard>
		</FadeUp>
	);
}

// Client logos section component
function ClientLogosSection() {
	return (
		<section className="py-12 sm:py-16 md:py-24 px-4 sm:px-6 md:px-8 bg-black overflow-hidden">
			<div className="max-w-7xl mx-auto">
				<motion.div
					initial={{ opacity: 0, y: 20 }}
					whileInView={{ opacity: 1, y: 0 }}
					viewport={{ once: true, margin: "-100px" }}
					transition={{ duration: 0.5, ease: "easeOut" }}
				>
					<h2 className="text-xl sm:text-2xl font-normal text-center mb-4 sm:mb-8 text-white px-4">
						Trusted by engineers from
					</h2>
				</motion.div>

				<motion.div
					initial={{ opacity: 0, y: 20 }}
					whileInView={{ opacity: 1, y: 0 }}
					viewport={{ once: true, margin: "-100px" }}
					transition={{ duration: 0.5, delay: 0.2 }}
					className="relative"
				>
					<div className="flex overflow-hidden">
						<motion.div
							className="flex gap-12 sm:gap-16 md:gap-24"
							animate={{
								x: [0, -1000],
							}}
							transition={{
								x: {
									repeat: Number.POSITIVE_INFINITY,
									repeatType: "loop",
									duration: 20,
									ease: "linear",
								},
							}}
						>
							{/* Render logos three times for seamless loop */}
							{[...Array(3)].map((_, setIndex) => (
								<div
									key={setIndex}
									className="flex gap-12 sm:gap-16 md:gap-24 items-center"
								>
									{CLIENT_LOGOS.map((client) => (
										<div
											key={`${setIndex}-${client.name}`}
											className="text-white text-lg sm:text-xl md:text-2xl lg:text-3xl font-semibold opacity-60 hover:opacity-100 transition-opacity cursor-pointer whitespace-nowrap"
										>
											{client.logo}
										</div>
									))}
								</div>
							))}
						</motion.div>
					</div>
				</motion.div>
			</div>
		</section>
	);
}

// Scale feature card component
interface ScaleFeatureCardProps {
	feature: (typeof SCALE_FEATURES)[number];
	delay: number;
	shadowColor?: "blue" | "green";
	className?: string;
	children: ReactNode;
}

function ScaleFeatureCard({
	feature,
	delay,
	shadowColor = "blue",
	className = "",
	children,
}: ScaleFeatureCardProps) {
	const shadowClass =
		shadowColor === "green"
			? "hover:shadow-green-500/10"
			: "hover:shadow-blue-500/10";

	return (
		<motion.div
			initial={{ opacity: 0, y: 20 }}
			whileInView={{ opacity: 1, y: 0 }}
			viewport={{ once: true, margin: "-100px" }}
			transition={{ duration: 0.5, delay }}
			whileHover={{ y: -1, transition: { duration: 0.2 } }}
			className={className}
		>
			<Card
				className={`p-4 sm:p-6 md:p-8 bg-zinc-950 border-zinc-800 rounded-2xl sm:rounded-3xl h-full min-h-[350px] sm:min-h-[400px] flex flex-col justify-between transition-shadow hover:shadow-2xl ${shadowClass} hover:border-zinc-700`}
			>
				<div>
					<h3 className="text-xl sm:text-2xl font-semibold mb-2 sm:mb-3 text-white">
						{feature.title}
					</h3>
					<p className="text-sm sm:text-base text-zinc-400 mb-4 sm:mb-6">
						{feature.description}
					</p>
					<a
						href="/#"
						className="text-sm sm:text-base text-zinc-400 hover:text-white transition-colors inline-flex items-center gap-2 group"
					>
						{feature.link}
						<motion.span
							className="inline-block"
							whileHover={{ x: 4 }}
							transition={{ duration: 0.2 }}
						>
							→
						</motion.span>
					</a>
				</div>
				{children}
			</Card>
		</motion.div>
	);
}

// Scale features section component
function ScaleFeaturesSection() {
	return (
		<section className="py-12 sm:py-16 md:py-24 px-4 sm:px-6 md:px-8 bg-black">
			<div className="max-w-7xl mx-auto">
				<motion.div
					initial={{ opacity: 0, y: 20 }}
					whileInView={{ opacity: 1, y: 0 }}
					viewport={{ once: true, margin: "-100px" }}
					transition={{ duration: 0.5, ease: "easeOut" }}
				>
					<h2 className="text-3xl sm:text-4xl md:text-5xl lg:text-6xl font-bold mb-8 sm:mb-12 md:mb-16 text-white">
						Build like a
						<br />
						VP of Engineering
					</h2>
				</motion.div>

				<div className="grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-6">
					{/* Analytics Card */}
					<ScaleFeatureCard feature={SCALE_FEATURES[0]} delay={0.1}>
						<div className="mt-4 sm:mt-8 p-4 sm:p-6 bg-zinc-900 rounded-2xl border border-zinc-800">
							<div className="mb-4">
								<h4 className="text-white font-semibold mb-2 text-sm sm:text-base">
									Overview
								</h4>
								<div className="grid grid-cols-3 gap-2 sm:gap-4 md:gap-6 lg:gap-8">
									<div>
										<div className="text-zinc-400 text-xs sm:text-sm">
											Live Visitors
										</div>
										<div className="text-white text-lg sm:text-xl md:text-2xl font-bold">
											414
										</div>
									</div>
									<div>
										<div className="text-zinc-400 text-xs sm:text-sm">
											Unique Visitors
										</div>
										<div className="text-white text-lg sm:text-xl md:text-2xl font-bold">
											1.7M
										</div>
									</div>
									<div>
										<div className="text-zinc-400 text-xs sm:text-sm">
											Total Pageviews
										</div>
										<div className="text-white text-lg sm:text-xl md:text-2xl font-bold">
											3.2M
										</div>
									</div>
								</div>
							</div>
							<div className="h-24 sm:h-32 bg-gradient-to-t from-blue-500/10 to-transparent rounded-lg" />
						</div>
					</ScaleFeatureCard>

					{/* A/B Testing Card */}
					<ScaleFeatureCard feature={SCALE_FEATURES[1]} delay={0.2}>
						<div className="mt-4 sm:mt-8 relative">
							<div className="absolute top-0 right-0 w-48 h-48 sm:w-64 sm:h-64 bg-blue-500/20 rounded-full blur-3xl" />
							<div className="relative p-4 bg-zinc-900 rounded-2xl border border-zinc-800">
								<div className="text-xs text-zinc-400 mb-2">
									Version Control
								</div>
								<div className="space-y-2">
									<div className="p-2 bg-zinc-800 rounded text-white text-sm">
										Version A
									</div>
									<div className="p-2 bg-blue-500/20 border border-blue-500/50 rounded text-white text-sm">
										Version B ✓
									</div>
								</div>
							</div>
						</div>
					</ScaleFeatureCard>

					{/* SEO Card */}
					<ScaleFeatureCard
						feature={SCALE_FEATURES[2]}
						delay={0.3}
						shadowColor="green"
						className="md:col-span-2"
					>
						<div className="flex-1 flex items-center justify-center mt-4 sm:mt-8">
							<div className="p-4 sm:p-6 bg-zinc-900 rounded-2xl border border-zinc-800 w-full">
								<div className="text-center mb-4">
									<div className="text-xs sm:text-sm text-zinc-400 mb-2">
										Google Lighthouse
									</div>
									<div className="flex justify-center gap-4 sm:gap-6 md:gap-8">
										<div className="text-center">
											<div className="w-12 h-12 sm:w-14 sm:h-14 md:w-16 md:h-16 rounded-full border-4 border-green-500 flex items-center justify-center text-white font-bold mb-1 text-sm sm:text-base">
												99
											</div>
											<div className="text-xs text-zinc-400">SEO</div>
										</div>
										<div className="text-center">
											<div className="w-12 h-12 sm:w-14 sm:h-14 md:w-16 md:h-16 rounded-full border-4 border-green-500 flex items-center justify-center text-white font-bold mb-1 text-sm sm:text-base">
												100
											</div>
											<div className="text-xs text-zinc-400">Performance</div>
										</div>
										<div className="text-center">
											<div className="w-12 h-12 sm:w-14 sm:h-14 md:w-16 md:h-16 rounded-full border-4 border-blue-500 flex items-center justify-center text-white font-bold mb-1 text-sm sm:text-base">
												98
											</div>
											<div className="text-xs text-zinc-400">Accessibility</div>
										</div>
									</div>
								</div>
							</div>
						</div>
					</ScaleFeatureCard>
				</div>
			</div>
		</section>
	);
}

// Main page component
export default function Home() {
	return (
		<>
			<Header />
			<main className="flex min-h-screen flex-col bg-black">
				<HeroSection />
				<ClientLogosSection />
				<ScaleFeaturesSection />
				<Footer />
			</main>
		</>
	);
}
