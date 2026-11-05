import { getInitials } from "@superset/shared/names";

export function OrganizationMark({
	name,
	logo,
}: {
	name: string;
	logo: string | null;
}) {
	if (logo) {
		return (
			<img
				src={logo}
				alt=""
				className="size-full rounded-md border border-foreground/10 object-cover"
			/>
		);
	}
	return (
		<span className="grid size-full place-items-center rounded-md bg-foreground font-semibold text-[11px] text-background">
			{getInitials(name).slice(0, 1) || "?"}
		</span>
	);
}
