import type { RouterOutputs } from "@superset/trpc";
import { WaveSpinner } from "@superset/ui/atoms/WaveSpinner";
import { LuCheck, LuCircleStop, LuX } from "react-icons/lu";

type TurnStatusValue =
	RouterOutputs["agent"]["activity"]["turns"][number]["status"];

export function TurnStatus({ status }: { status: TurnStatusValue }) {
	if (status === "running")
		return <WaveSpinner className="text-foreground/80" />;
	if (status === "completed")
		return <LuCheck className="size-3.5 text-green-500" />;
	if (status === "interrupted") return <LuCircleStop className="size-3.5" />;
	return <LuX className="size-3.5 text-red-500" />;
}
