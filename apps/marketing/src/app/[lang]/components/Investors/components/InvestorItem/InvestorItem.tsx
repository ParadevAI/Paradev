import Image from "next/image";

interface InvestorItemProps {
	investor: { name: string; detail?: string; href?: string; logo?: string };
}

export function InvestorItem({ investor }: InvestorItemProps) {
	const content = (
		<>
			{investor.logo ? (
				<Image
					src={investor.logo}
					alt=""
					width={28}
					height={28}
					className="size-7 shrink-0 rounded-md"
				/>
			) : (
				<span
					aria-hidden
					className="flex size-7 shrink-0 items-center justify-center rounded-md border border-border text-xs text-muted-foreground"
				>
					{investor.name.charAt(0)}
				</span>
			)}
			<div className="min-w-0">
				<p className="text-sm text-foreground underline-offset-4 group-hover:underline">
					{investor.name}
				</p>
				{investor.detail && (
					<p className="text-sm text-muted-foreground">{investor.detail}</p>
				)}
			</div>
		</>
	);

	if (!investor.href) {
		return <div className="flex items-center gap-3">{content}</div>;
	}

	return (
		<a
			href={investor.href}
			target="_blank"
			rel="noopener noreferrer"
			className="group flex items-center gap-3 rounded-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-4 focus-visible:ring-offset-background"
		>
			{content}
		</a>
	);
}
