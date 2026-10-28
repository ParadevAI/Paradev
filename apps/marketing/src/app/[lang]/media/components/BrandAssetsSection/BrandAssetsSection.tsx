import { Trans } from "@lingui/react/macro";
import { getAllPeople } from "@/lib/people";
import { SectionHeading } from "../SectionHeading";
import { AssetCard } from "./components/AssetCard";
import { FounderCard } from "./components/FounderCard";
import { LOGO_ASSETS, PRODUCT_IMAGE_ASSETS } from "./constants";

export function BrandAssetsSection() {
	const founders = getAllPeople().filter(
		(person) =>
			person.avatar && person.role.toLowerCase().startsWith("cofounder"),
	);

	return (
		<section aria-labelledby="brand-assets">
			<SectionHeading id="brand-assets">
				<Trans>Brand assets</Trans>
			</SectionHeading>
			<p className="mt-6 text-muted-foreground leading-relaxed">
				<Trans>
					Download our logos, product images, and founder photos for use in
					coverage of Paradev.
				</Trans>
			</p>
			<h3 className="mt-8 font-medium text-foreground">
				<Trans>Logos</Trans>
			</h3>
			<ul className="mt-4 grid gap-4 sm:grid-cols-3">
				{LOGO_ASSETS.map((asset) => (
					<AssetCard key={asset.src} asset={asset} />
				))}
			</ul>
			<h3 className="mt-10 font-medium text-foreground">
				<Trans>Product images</Trans>
			</h3>
			<ul className="mt-4 grid gap-4 sm:grid-cols-3">
				{PRODUCT_IMAGE_ASSETS.map((asset) => (
					<AssetCard key={asset.src} asset={asset} />
				))}
			</ul>
			<h3 className="mt-10 font-medium text-foreground">
				<Trans>Founders</Trans>
			</h3>
			<ul className="mt-4 grid gap-4 sm:grid-cols-3">
				{founders.map((person) => (
					<FounderCard
						key={person.id}
						id={person.id}
						name={person.name}
						role={person.role}
						avatar={person.avatar ?? ""}
					/>
				))}
			</ul>
		</section>
	);
}
