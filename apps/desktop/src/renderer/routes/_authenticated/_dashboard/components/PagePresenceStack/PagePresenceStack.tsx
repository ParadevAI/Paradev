import { useLingui } from "@lingui/react/macro";
import { usePresenceViewers, usePresenceVisitors } from "@superset/ui/presence";
import { useMemo } from "react";
import { useNow } from "renderer/hooks/useNow";
import { authClient } from "renderer/lib/auth-client";
import { PresenceStack } from "renderer/routes/_authenticated/_dashboard/components/PresenceStack";
import { withGuests } from "./utils/withGuests";

const NOW_TICK_MS = 30_000;

export function PagePresenceStack({ pageId }: { pageId: string | undefined }) {
	const { t } = useLingui();
	const now = useNow(NOW_TICK_MS);
	const { data: session } = authClient.useSession();
	const visitors = usePresenceVisitors(pageId);
	const viewers = usePresenceViewers(pageId);
	const people = useMemo(
		() =>
			withGuests(
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
			viewerId={session?.user?.id}
			now={now}
			overflowLabel={t({ message: "Show everyone who opened this page" })}
		/>
	);
}
