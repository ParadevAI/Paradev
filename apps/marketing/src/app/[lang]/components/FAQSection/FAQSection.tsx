"use client";

import { Trans, useLingui } from "@lingui/react/macro";
import Link from "next/link";
import type { ReactNode } from "react";
import { FAQDisclosure } from "../FAQDisclosure";
import { FAQ_ITEMS } from "./constants";

export interface FAQSectionItem {
	id: string;
	question: string;
	answer: ReactNode;
	link?: { href: string; label: string };
}

export function FAQSection({ items }: { items?: FAQSectionItem[] }) {
	const { t } = useLingui();
	const entries: FAQSectionItem[] =
		items ??
		FAQ_ITEMS.map((item) => ({
			id: item.id,
			question: t(item.question),
			answer: t(item.answer),
			link: item.link && {
				href: item.link.href,
				label: t(item.link.label),
			},
		}));

	return (
		<section className="relative py-24 sm:py-32">
			<div className="max-w-7xl mx-auto px-6 sm:px-8">
				<div className="grid grid-cols-1 xl:grid-cols-[1fr_1.5fr] gap-12 xl:gap-20">
					<div className="xl:sticky xl:top-24 xl:self-start">
						<h2 className="text-3xl sm:text-4xl lg:text-5xl font-medium tracking-tight text-foreground leading-[1.1]">
							<Trans>
								Frequently
								<br />
								asked questions
							</Trans>
						</h2>
					</div>

					<div>
						<div className="w-full">
							{entries.map((item) => (
								<FAQDisclosure
									key={item.id}
									name="home-faq"
									question={item.question}
								>
									<p>{item.answer}</p>
									{item.link && (
										<Link
											href={item.link.href}
											className="inline-block text-brand hover:text-brand-light transition-colors"
										>
											{item.link.label} →
										</Link>
									)}
								</FAQDisclosure>
							))}
						</div>
					</div>
				</div>
			</div>
		</section>
	);
}
