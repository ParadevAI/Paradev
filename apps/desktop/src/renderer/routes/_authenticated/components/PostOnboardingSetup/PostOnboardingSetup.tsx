import { useEffect } from "react";
import { electronTrpc } from "renderer/lib/electron-trpc";

export function PostOnboardingSetup() {
	const { mutate: run } = electronTrpc.postOnboardingSetup.run.useMutation();

	useEffect(() => {
		run();
	}, [run]);

	return null;
}
