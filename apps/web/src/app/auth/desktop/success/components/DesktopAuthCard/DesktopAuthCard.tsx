import Image from "next/image";
import type { ReactNode } from "react";

export function DesktopAuthCard({
	title,
	description,
	children,
}: {
	title: ReactNode;
	description: ReactNode;
	children?: ReactNode;
}) {
	return (
		<div className="flex min-h-screen flex-col items-center justify-center bg-background p-4 pb-[12vh]">
			<div className="flex w-full max-w-xs flex-col items-center text-center">
				<Image
					src="/title.svg"
					alt="Superset"
					width={140}
					height={43}
					priority
				/>
				<h1 className="mt-6 text-lg font-medium text-foreground">{title}</h1>
				<p className="mt-1 text-balance text-sm text-muted-foreground">
					{description}
				</p>
				{children && <div className="mt-4">{children}</div>}
			</div>
		</div>
	);
}
