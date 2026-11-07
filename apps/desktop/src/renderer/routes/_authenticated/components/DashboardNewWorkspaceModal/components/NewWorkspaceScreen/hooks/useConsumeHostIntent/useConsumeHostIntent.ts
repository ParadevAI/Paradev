import { useEffect } from "react";

/** Navigations replace the URL, so a host in it is saved and removed, never read as state. */
export function useConsumeHostIntent({
	isOpen,
	intentHostId,
	saveHost,
	clearIntent,
}: {
	isOpen: boolean;
	intentHostId: string | null;
	saveHost: (hostId: string) => void;
	clearIntent: () => void;
}) {
	useEffect(() => {
		if (!isOpen || !intentHostId) return;
		saveHost(intentHostId);
		clearIntent();
	}, [isOpen, intentHostId, saveHost, clearIntent]);
}
