import type { ReactNode } from "react";
import { CodeEditor } from "renderer/routes/_authenticated/components/CodeEditor";

interface ScriptFieldProps {
	/** Picks the highlighting, as a file of that name would get. */
	fileName: string;
	label: ReactNode;
	ariaLabel: string;
	description: ReactNode;
	placeholder: string;
	value: string;
	onChange: (value: string) => void;
	onSave?: () => void;
	notice?: ReactNode;
	readOnly?: boolean;
}

export function ScriptField({
	fileName,
	label,
	ariaLabel,
	description,
	placeholder,
	value,
	onChange,
	onSave,
	notice,
	readOnly = false,
}: ScriptFieldProps) {
	return (
		<div className="flex flex-col gap-1.5 p-3">
			<div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
				<span className="text-xs font-medium">{label}</span>
				<span className="text-xs text-muted-foreground">{description}</span>
			</div>
			<div className="h-52 overflow-hidden rounded-md border border-border/70">
				<CodeEditor
					ariaLabel={ariaLabel}
					filePath={fileName}
					language="shell"
					onChange={onChange}
					onSave={onSave}
					placeholder={placeholder}
					readOnly={readOnly}
					tabIndents={false}
					value={value}
				/>
			</div>
			{notice}
		</div>
	);
}
