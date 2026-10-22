import type { ReactNode } from "react";
import { useDelayElapsed } from "renderer/hooks/useDelayElapsed";
import type { useSessionRecovery } from "renderer/hooks/useSessionRecovery";
import { SessionRecoveryScreen } from "./components/SessionRecoveryScreen";

interface SessionRecoveryBoundaryProps {
	recovery: ReturnType<typeof useSessionRecovery>;
	mode: "authenticated" | "sign-in";
	onSignOut: () => Promise<void>;
	children: () => ReactNode;
	bypassAuth?: boolean;
	timeoutMs?: number;
}

export function SessionRecoveryBoundary({
	recovery,
	mode,
	onSignOut,
	children,
	bypassAuth = false,
	timeoutMs = 15_000,
}: SessionRecoveryBoundaryProps) {
	const {
		hasLocalToken,
		isPending,
		isRefetching,
		isRecovering,
		isOnline,
		session,
	} = recovery;
	const hasUnresolvedSession = hasLocalToken && !session?.user;
	const isRestoring =
		!bypassAuth &&
		(isPending ||
			isRecovering ||
			(hasUnresolvedSession &&
				(isRefetching || (mode === "sign-in" && !isOnline))));
	const timedOut = useDelayElapsed(isRestoring, timeoutMs);

	if (!isRestoring || (mode === "sign-in" && !hasLocalToken && timedOut)) {
		return children();
	}

	return (
		<SessionRecoveryScreen
			timedOut={timedOut}
			onRetry={recovery.refetch}
			onSignOut={onSignOut}
		/>
	);
}
