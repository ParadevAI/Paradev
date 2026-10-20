import { Trans, useLingui } from "@lingui/react/macro";
import { useFormat } from "@superset/i18n/react";
import type { PresenceVisitor } from "@superset/shared/page-presence";
import { AvatarStack } from "@superset/ui/atoms/AvatarStack";
import {
	HoverCard,
	HoverCardContent,
	HoverCardTrigger,
} from "@superset/ui/hover-card";
import { PresenceOverflow } from "./components/PresenceOverflow";
import { isViewerAlone } from "./utils/isViewerAlone";

interface PresenceStackProps {
	people: PresenceVisitor[];
	viewerId: string | undefined;
	now: Date;
	overflowLabel: string;
	onOpenPerson?: (userId: string) => void;
}

export function PresenceStack({
	people,
	viewerId,
	now,
	overflowLabel,
	onOpenPerson,
}: PresenceStackProps) {
	const { t } = useLingui();
	const { formatCompactRelativeTime } = useFormat();
	if (isViewerAlone(people, viewerId)) return null;
	const byId = new Map(people.map((person) => [person.userId, person]));

	return (
		<AvatarStack
			people={people.map((person) => ({
				id: person.userId,
				name: person.name,
				image: person.image,
				isActive: person.active,
			}))}
			size={20}
			className="px-1"
			renderOverflow={(hidden, count) => (
				<PresenceOverflow
					people={hidden.flatMap((stacked) => byId.get(stacked.id) ?? [])}
					label={String(count)}
					ariaLabel={overflowLabel}
					now={now}
					onOpenPerson={onOpenPerson}
				/>
			)}
			renderPerson={(stacked, avatar) => {
				const person = byId.get(stacked.id);
				if (!person) return avatar;
				const active = person.active;
				const lastSeen = formatCompactRelativeTime(
					new Date(person.lastSeenAt),
					now,
				);
				return (
					<HoverCard openDelay={200} closeDelay={100}>
						<HoverCardTrigger asChild>
							<button
								type="button"
								onClick={() => onOpenPerson?.(person.userId)}
								aria-label={person.name}
								className="block size-full cursor-pointer rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
							>
								{avatar}
							</button>
						</HoverCardTrigger>
						<HoverCardContent align="end" className="w-60 p-3">
							<div className="flex items-center gap-3">
								<AvatarStack
									people={[
										{
											id: person.userId,
											name: person.name,
											image: person.image,
											isActive: active,
										},
									]}
									size={32}
								/>
								<div className="min-w-0">
									<div className="truncate text-sm font-medium">
										{person.name}
									</div>
									<div className="text-xs text-muted-foreground">
										{active ? (
											<span className="text-foreground/80">
												<Trans context="presence">Active</Trans>
											</span>
										) : (
											t({ message: `Last seen ${lastSeen}` })
										)}
									</div>
								</div>
							</div>
						</HoverCardContent>
					</HoverCard>
				);
			}}
		/>
	);
}
