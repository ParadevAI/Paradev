"use client";

import { useLingui } from "@lingui/react/macro";
import { FolderOpenIcon } from "lucide-react";

export type RevealButtonProps = {
	onClick: () => void;
};

export function RevealButton({ onClick }: RevealButtonProps) {
	const { t } = useLingui();
	const label = t({ message: "Show in folder" });
	return (
		<button
			type="button"
			aria-label={label}
			title={label}
			className="absolute right-1 bottom-1 z-10 flex size-5 cursor-pointer items-center justify-center rounded-full bg-background/90 text-muted-foreground opacity-0 shadow-sm transition-opacity hover:text-foreground focus-visible:opacity-100 group-hover/pill:opacity-100"
			onClick={onClick}
		>
			<FolderOpenIcon className="size-3" />
		</button>
	);
}
