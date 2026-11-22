import { Trans } from "@lingui/react/macro";
import { cn } from "@superset/ui/utils";
import { LuContainer, LuLoaderCircle } from "react-icons/lu";

interface SetUpEnvironmentButtonProps {
	onClick: () => void;
	pending?: boolean;
	className?: string;
}

export function SetUpEnvironmentButton({
	onClick,
	pending = false,
	className,
}: SetUpEnvironmentButtonProps) {
	return (
		<button
			type="button"
			disabled={pending}
			onClick={onClick}
			className={cn(
				"flex h-8 cursor-pointer items-center gap-2 rounded-full bg-emerald-500/10 px-3 text-emerald-500 text-sm transition-colors hover:bg-emerald-500/15 disabled:cursor-default disabled:opacity-70",
				className,
			)}
		>
			{pending ? (
				<LuLoaderCircle className="size-4 shrink-0 animate-spin" />
			) : (
				<LuContainer className="size-4 shrink-0" />
			)}
			<Trans>Set up Environment</Trans>
		</button>
	);
}
