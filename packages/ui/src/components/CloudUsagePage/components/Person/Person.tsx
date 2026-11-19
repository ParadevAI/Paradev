import { Avatar } from "../../../../atoms/Avatar";
import { cn } from "../../../../lib/utils";

export function Person({
	name,
	image,
	className,
}: {
	name: string;
	image: string | null;
	className?: string;
}) {
	return (
		<span
			title={name}
			className={cn(
				"inline-flex min-w-0 max-w-full items-start gap-2",
				className,
			)}
		>
			<Avatar
				size="xs"
				fullName={name}
				image={image}
				className="mt-0.5 shrink-0"
			/>
			<span className="break-words">{name}</span>
		</span>
	);
}
