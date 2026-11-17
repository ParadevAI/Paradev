import { ArrowUpRight } from "lucide-react";
import Image from "next/image";
import type { About } from "@/lib/about";
import { AllInvestorsDialog } from "./components/AllInvestorsDialog";
import { InvestorItem } from "./components/InvestorItem";

interface InvestorsProps {
	investors: About["investors"];
	moreInvestors: About["moreInvestors"];
}

export function Investors({ investors, moreInvestors }: InvestorsProps) {
	const featured = investors.filter((investor) => investor.featured);
	const others = investors.filter((investor) => !investor.featured);

	return (
		<div>
			<div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
				{featured.map((investor) => (
					<a
						key={investor.name}
						href={investor.href}
						target="_blank"
						rel="noopener noreferrer"
						className="group flex flex-col justify-between gap-10 border border-border p-6 hover:bg-muted/50 hover:border-foreground/20 transition-colors"
					>
						<div className="flex items-start justify-between">
							{investor.logo && (
								<Image
									src={investor.logo}
									alt=""
									width={40}
									height={40}
									className="size-10 rounded-md"
								/>
							)}
							<ArrowUpRight className="size-4 text-muted-foreground group-hover:text-foreground transition-colors" />
						</div>
						<div>
							<p className="text-lg text-foreground">{investor.name}</p>
							{investor.detail && (
								<p className="text-sm text-muted-foreground mt-1">
									{investor.detail}
								</p>
							)}
						</div>
					</a>
				))}
			</div>

			<ul className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-x-8 gap-y-6 mt-10">
				{others.map((investor) => (
					<li key={investor.name}>
						<InvestorItem investor={investor} />
					</li>
				))}
			</ul>
			<div className="mt-8 flex justify-end">
				<AllInvestorsDialog investors={[...investors, ...moreInvestors]} />
			</div>
		</div>
	);
}
