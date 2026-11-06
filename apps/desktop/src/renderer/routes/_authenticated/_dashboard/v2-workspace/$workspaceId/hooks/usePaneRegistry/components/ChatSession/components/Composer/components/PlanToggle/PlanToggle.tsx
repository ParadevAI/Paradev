import { useLingui } from "@lingui/react/macro";
import { cn } from "@superset/ui/utils";
import { NotebookPen } from "lucide-react";
import { PILL_TRIGGER_CLASS } from "renderer/routes/_authenticated/components/AgentComposer/constants";
import { useOptimisticSelections } from "renderer/routes/_authenticated/components/AgentComposer/hooks/useOptimisticSelections";
import type { PlanToggleControl } from "../../hooks/usePlanControl";

const ON = "on";
const OFF = "off";

export function PlanToggle({
	plan,
	iconOnly,
}: {
	plan: PlanToggleControl;
	iconOnly?: boolean;
}) {
	const { t } = useLingui();
	const { shown, select } = useOptimisticSelections({
		plan: plan.active ? ON : OFF,
	});
	const active = shown("plan") === ON;
	const label = t({ message: "Plan" });

	return (
		<button
			aria-pressed={active}
			className={cn(
				PILL_TRIGGER_CLASS,
				"shrink-0",
				active
					? "bg-foreground/[0.07] text-highlight hover:text-highlight"
					: "text-muted-foreground",
			)}
			data-footer-label
			onClick={() =>
				active
					? select("plan", OFF, plan.leave)
					: select("plan", ON, plan.enter)
			}
			title={t({ message: "Read and plan without changing anything" })}
			type="button"
		>
			<NotebookPen className="size-3.5 shrink-0" />
			<span className={iconOnly ? "sr-only" : undefined}>{label}</span>
		</button>
	);
}
