import { getI18nInstance } from "@superset/i18n/server";
import dynamic from "next/dynamic";
import { FAQ_ITEMS } from "@/app/[lang]/components/FAQSection";
import { WebMcpTools } from "@/app/[lang]/components/WebMcpTools";
import { FAQPageJsonLd, ServiceJsonLd } from "@/components/JsonLd";
import type { LandingCopy } from "../../copy";
import { LandingHero } from "../LandingHero";

// Lazy load below-fold sections to reduce initial JS bundle (~304 KiB unused JS)
const TrustedBySection = dynamic(() =>
	import("@/app/[lang]/components/TrustedBySection").then(
		(mod) => mod.TrustedBySection,
	),
);
const MobileSection = dynamic(() =>
	import("@/app/[lang]/components/MobileSection").then(
		(mod) => mod.MobileSection,
	),
);
const LandingFeatures = dynamic(() =>
	import("../LandingFeatures").then((mod) => mod.LandingFeatures),
);
const WallOfLoveSection = dynamic(() =>
	import("@/app/[lang]/components/WallOfLoveSection").then(
		(mod) => mod.WallOfLoveSection,
	),
);
const SecuritySection = dynamic(() =>
	import("@/app/[lang]/components/SecuritySection").then(
		(mod) => mod.SecuritySection,
	),
);
const FAQSection = dynamic(() =>
	import("@/app/[lang]/components/FAQSection").then((mod) => mod.FAQSection),
);

export function LandingPage({ copy }: { copy: LandingCopy }) {
	const i18n = getI18nInstance("en");

	return (
		<main className="flex flex-col bg-background">
			<FAQPageJsonLd
				items={FAQ_ITEMS.map((item) => ({
					question: i18n._(item.question),
					answer: i18n._(item.answer),
				}))}
			/>
			<ServiceJsonLd />
			<WebMcpTools />
			<LandingHero
				lead={copy.lead}
				emphasis={copy.emphasis}
				subheadline={copy.subheadline}
				promoCode={copy.promoCode}
				badge={copy.badge}
			/>
			<MobileSection />
			<TrustedBySection />
			<LandingFeatures overlay={copy.feature} />
			<WallOfLoveSection />
			<SecuritySection />
			<FAQSection />
		</main>
	);
}
