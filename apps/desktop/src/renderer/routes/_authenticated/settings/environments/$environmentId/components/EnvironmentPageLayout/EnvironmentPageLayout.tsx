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
		<div className="flex w-full max-w-4xl flex-col p-6">
			<button
				className="mx-4 mb-2 flex items-center gap-2 self-start text-sm text-muted-foreground transition-colors hover:text-foreground"
				onClick={onBack}
				type="button"
			>
				<HiArrowLeft className="size-4" />
				{backLabel}
			</button>
			<div className="select-text">{children}</div>
		</div>
	);
}
