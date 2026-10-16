import { Tooltip, TooltipContent, TooltipTrigger } from "@superset/ui/tooltip";
import type { ReactNode } from "react";

const CLASS =
	"flex size-10 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-fill-hover hover:text-foreground";

type HeaderIconButtonProps = { label: string; children: ReactNode } & (
	| { href: string; onClick?: never }
	| { onClick: () => void; href?: never }
);

/** A round icon button on the subject row, as a link or a button. */
export function HeaderIconButton({
	label,
	href,
	onClick,
	children,
}: HeaderIconButtonProps) {
	return (
		<Tooltip delayDuration={300}>
			<TooltipTrigger asChild>
				{href ? (
					<a
						href={href}
						target="_blank"
						rel="noreferrer"
						aria-label={label}
						className={CLASS}
					>
						{children}
					</a>
				) : (
					<button
						type="button"
						aria-label={label}
						onClick={onClick}
						className={CLASS}
					>
						{children}
					</button>
				)}
			</TooltipTrigger>
			<TooltipContent side="bottom">{label}</TooltipContent>
		</Tooltip>
	);
}
