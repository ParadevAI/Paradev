import { MarqueeText } from "renderer/components/MarqueeText";

interface WorkspaceNameMarqueeProps {
	name: string;
	prefix?: string;
	suffix?: string | null;
	className?: string;
	forceActive?: boolean;
}

export function WorkspaceNameMarquee({
	name,
	prefix,
	suffix,
	className,
	forceActive,
}: WorkspaceNameMarqueeProps) {
	const label = prefix ? `${prefix}/${name}` : name;
	return (
		<MarqueeText
			title={suffix ? `${label} · ${suffix}` : label}
			className={className}
			forceActive={forceActive}
		>
			{prefix && <span className="text-muted-foreground">{`${prefix}/`}</span>}
			{name}
			{suffix && (
				<span className="ml-1.5 font-mono text-[11px] text-muted-foreground/60">
					{suffix}
				</span>
			)}
		</MarqueeText>
	);
}
