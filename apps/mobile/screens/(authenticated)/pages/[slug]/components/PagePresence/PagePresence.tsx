import { useLingui } from "@lingui/react/macro";
import {
	type PagePresenceViewer,
	presencePeople,
} from "@superset/shared/page-presence";
import { openPagePresence } from "@superset/shared/page-presence-client";
import { useEffect, useRef, useState } from "react";
import { AppState } from "react-native";
import { PresenceAvatars } from "./components/PresenceAvatars";

export function PagePresence({ url }: { url: () => Promise<string | null> }) {
	const { t } = useLingui();
	const [viewers, setViewers] = useState<PagePresenceViewer[]>([]);
	const urlRef = useRef(url);
	urlRef.current = url;

	useEffect(() => {
		const client = openPagePresence({
			url: () => urlRef.current(),
			onViewers: setViewers,
		});
		const subscription = AppState.addEventListener("change", (state) => {
			if (state === "active") client.wake();
		});
		return () => {
			subscription.remove();
			client.stop();
		};
	}, []);

	const people = presencePeople(
		[],
		viewers,
		(number) =>
			number ? t({ message: `Guest ${number}` }) : t({ message: "Guest" }),
		Date.now(),
	);

	return people.length > 0 ? <PresenceAvatars people={people} /> : null;
}
