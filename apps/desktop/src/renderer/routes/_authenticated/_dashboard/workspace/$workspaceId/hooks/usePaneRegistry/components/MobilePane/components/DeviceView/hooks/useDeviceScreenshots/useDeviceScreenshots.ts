import type { SelectScreenshot } from "@superset/local-db";
import { useEffect, useState } from "react";
import { electronTrpcClient } from "renderer/lib/trpc-client";

export function useDeviceScreenshots(deviceKey: string): SelectScreenshot[] {
	const [shots, setShots] = useState<SelectScreenshot[]>([]);
	useEffect(() => {
		const subscription =
			electronTrpcClient.screenshots.onDeviceChanged.subscribe(
				{ deviceKey },
				{ onData: setShots },
			);
		return () => subscription.unsubscribe();
	}, [deviceKey]);
	return shots;
}
