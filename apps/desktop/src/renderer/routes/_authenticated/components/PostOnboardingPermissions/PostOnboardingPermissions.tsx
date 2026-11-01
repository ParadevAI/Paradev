import { useEffect } from "react";
import { electronTrpc } from "renderer/lib/electron-trpc";

export function PostOnboardingPermissions({
	onboarded,
}: {
	onboarded: boolean;
}) {
	const { mutate } =
		electronTrpc.permissions.requestPostOnboardingAccess.useMutation();
	useEffect(() => {
		if (onboarded) mutate();
	}, [onboarded, mutate]);
	return null;
}
