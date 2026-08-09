import { COMPANY } from "@superset/shared/constants";
import { Button } from "@superset/ui/button";
import { LuPlus } from "react-icons/lu";
import {
	AUTOMATION_TEMPLATE_CATEGORIES,
	type AutomationTemplate,
} from "../../templates";
import { TemplateCard } from "../TemplateCard";

interface AutomationsEmptyStateProps {
	onSelectTemplate: (template: AutomationTemplate) => void;
	onCreate: () => void;
}

export function AutomationsEmptyState({
	onSelectTemplate,
	onCreate,
}: AutomationsEmptyStateProps) {
	// One suggestion per category keeps the first-run screen scannable; the
	// full gallery stays available inside the create dialog.
	const suggestions = AUTOMATION_TEMPLATE_CATEGORIES.flatMap((category) =>
		category.templates.slice(0, 1),
	);

	return (
		<div className="mx-auto flex min-h-full w-full max-w-2xl flex-col items-center justify-center gap-10 pb-10">
			<div className="flex flex-col items-center gap-2 text-center">
				<h2 className="text-lg font-semibold tracking-tight">
					No automations yet
				</h2>
				<p className="max-w-sm text-sm text-muted-foreground">
					Run agents on a schedule. Each run creates a workspace with the
					results ready to review.
				</p>
				<div className="mt-3 flex items-center gap-2">
					<Button
						type="button"
						size="sm"
						className="h-8 gap-1.5 px-3"
						onClick={onCreate}
					>
						<LuPlus className="size-4" />
						Create automation
					</Button>
					<Button
						asChild
						variant="ghost"
						size="sm"
						className="h-8 text-muted-foreground"
					>
						<a
							href={`${COMPANY.DOCS_URL}/automations`}
							target="_blank"
							rel="noreferrer"
						>
							Learn more
						</a>
					</Button>
				</div>
			</div>

			<div className="flex w-full flex-col gap-3">
				<h3 className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
					Suggested
				</h3>
				<div className="grid grid-cols-1 gap-2 md:grid-cols-2">
					{suggestions.map((template) => (
						<TemplateCard
							key={template.id}
							template={template}
							onSelect={onSelectTemplate}
						/>
					))}
				</div>
			</div>
		</div>
	);
}
