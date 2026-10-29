"use client";

import { useLingui } from "@lingui/react/macro";
import { presencePeople } from "@superset/shared/page-presence";
import { useMemo } from "react";
import { useNow } from "../../hooks/useNow";
import {
	usePresenceViewers,
	usePresenceVisitors,
} from "../../stores/presenceStore";
import { PresenceStack } from "../PresenceStack";

const NOW_TICK_MS = 30_000;

interface PagePresenceStackProps {
	pageId: string | undefined;
	viewerId: string | undefined;
	onOpenPerson?: (userId: string) => void;
}

export function PagePresenceStack({
	pageId,
	viewerId,
	onOpenPerson,
}: PagePresenceStackProps) {
	const { t } = useLingui();
	const now = useNow(NOW_TICK_MS);
	const visitors = usePresenceVisitors(pageId);
	const viewers = usePresenceViewers(pageId);
	const people = useMemo(
		() =>
			presencePeople(
				visitors,
				viewers,
				(number) =>
					number ? t({ message: `Guest ${number}` }) : t({ message: "Guest" }),
				now.getTime(),
			),
		[visitors, viewers, t, now],
	);
	return (
		<PresenceStack
			people={people}
			viewerId={viewerId}
			now={now}
			overflowLabel={t({ message: "Show everyone who opened this page" })}
			onOpenPerson={onOpenPerson}
		/>
	);
}
