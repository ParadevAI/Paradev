import { Trans, useLingui } from "@lingui/react/macro";
import { Search } from "lucide-react";
import { CATALOG } from "../../constants";
import { CatalogCard } from "./components/CatalogCard";

export function PluginCatalog() {
	const { t } = useLingui();

	return (
		<div className="relative mt-14 rounded-lg border border-border bg-background shadow-2xl">
			<div
				aria-hidden="true"
				className="pointer-events-none absolute -inset-px z-10 rounded-lg p-px"
				style={{
					background:
						"radial-gradient(520px circle at 0% 0%, rgba(255,255,255,0.28), rgba(255,255,255,0.07) 45%, transparent 75%)",
					WebkitMask:
						"linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0)",
					WebkitMaskComposite: "xor",
					maskComposite: "exclude",
				}}
			/>
			<div className="overflow-hidden rounded-lg">
				<div className="flex h-10 items-center gap-2 border-border border-b px-4 text-xs">
					<span className="font-medium text-foreground">
						<Trans>Plugins</Trans>
					</span>
					<span className="ml-auto text-muted-foreground">
						<Trans>Skills</Trans>
					</span>
				</div>
				<div className="relative max-h-[34rem] overflow-hidden px-4 pt-5 pb-6 sm:max-h-none sm:px-6">
					<div
						aria-hidden="true"
						className="flex h-9 items-center gap-2 rounded-full border border-border px-3 text-muted-foreground text-sm"
					>
						<Search className="size-4" />
						<Trans>Search plugins</Trans>
					</div>
					<div className="mt-6 space-y-6">
						{CATALOG.map((group) => (
							<section key={group.category.id}>
								<p className="font-medium text-foreground text-sm">
									{t(group.category)}
								</p>
								<ul className="mt-2 grid grid-cols-1 gap-1 sm:grid-cols-2 lg:grid-cols-3">
									{group.plugins.map((plugin) => (
										<CatalogCard key={plugin.name} plugin={plugin} />
									))}
								</ul>
							</section>
						))}
					</div>
					<div
						aria-hidden="true"
						className="pointer-events-none absolute inset-x-0 bottom-0 h-24 bg-gradient-to-t from-background to-transparent sm:hidden"
					/>
				</div>
			</div>
		</div>
	);
}
