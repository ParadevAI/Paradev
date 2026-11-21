import type { ReactNode } from "react";

interface MarketplaceNoticeProps {
	title: string;
	description: string;
	children?: ReactNode;
}

export function MarketplaceNotice({
	title,
	description,
	children,
}: MarketplaceNoticeProps) {
	return (
		<div className="flex min-h-screen items-center justify-center p-4">
			<div className="w-full max-w-md space-y-6 text-center">
				<div className="space-y-3">
					<h1 className="text-2xl font-semibold">{title}</h1>
					<p className="text-muted-foreground">{description}</p>
				</div>
				{children}
			</div>
		</div>
	);
}
