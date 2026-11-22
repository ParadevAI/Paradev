import { useContext, useLayoutEffect } from "react";
import { BareContentCardContext } from "../../context";

/** While mounted, the content card around this screen is plain frame with no border. A no-op outside the redesigned shell. */
export function useBareContentCard(): void {
	const setIsBare = useContext(BareContentCardContext);
	useLayoutEffect(() => {
		if (!setIsBare) return;
		setIsBare(true);
		return () => setIsBare(false);
	}, [setIsBare]);
}
