import type { ReactNode } from "react";
import { HiArrowLeft } from "react-icons/hi2";

interface EnvironmentPageLayoutProps {
	backLabel: ReactNode;
	onBack: () => void;
	children: ReactNode;
}

export function EnvironmentPageLayout({
	backLabel,
	onBack,
	children,
}: EnvironmentPageLayoutProps) {
	return (
		<div className="flex h-full w-full flex-col overflow-hidden bg-background">
			<div className="flex h-12 shrink-0 items-center px-4">
				<button
					className="flex items-center gap-2 text-sm text-muted-foreground transition-colors hover:text-foreground"
					onClick={onBack}
					type="button"
				>
					<HiArrowLeft className="size-4" />
					{backLabel}
				</button>
			</div>
			<div className="min-h-0 flex-1 overflow-y-auto">
				<div className="mx-auto w-full max-w-4xl select-text">{children}</div>
			</div>
		</div>
	);
}
