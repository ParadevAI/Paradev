import type { MessageDescriptor } from "@lingui/core";
import { Trans, useLingui } from "@lingui/react/macro";
import {
	HoverCard,
	HoverCardContent,
	HoverCardTrigger,
} from "@superset/ui/hover-card";
import type { ReactNode } from "react";
import { faqAnchor } from "../../../../../../utils/faqAnchor";

interface FeatureInfoProps {
	body: MessageDescriptor;
	faqId: string;
	values: Record<string, string | number>;
	children: ReactNode;
}

export function FeatureInfo({
	body,
	faqId,
	values,
	children,
}: FeatureInfoProps) {
	const { i18n } = useLingui();
	const href = `#${faqAnchor(faqId)}`;

	return (
		<HoverCard openDelay={100} closeDelay={150}>
			<HoverCardTrigger asChild>
				<a
					href={href}
					className="cursor-help underline decoration-muted-foreground/50 decoration-dotted underline-offset-[3px] transition-colors hover:text-foreground focus-visible:text-foreground focus-visible:outline-none"
				>
					{children}
				</a>
			</HoverCardTrigger>
			<HoverCardContent align="start" className="w-64 text-xs leading-relaxed">
				<p className="text-muted-foreground">{i18n._({ ...body, values })}</p>
				<a
					href={href}
					className="mt-2 inline-block text-foreground underline underline-offset-2"
				>
					<Trans>Learn more</Trans>
				</a>
			</HoverCardContent>
		</HoverCard>
	);
}
