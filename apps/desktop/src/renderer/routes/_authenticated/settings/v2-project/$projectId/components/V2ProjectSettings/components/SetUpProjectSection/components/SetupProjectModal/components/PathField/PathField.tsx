import { useLingui } from "@lingui/react/macro";
import { Button } from "@superset/ui/button";
import { Input } from "@superset/ui/input";
import { LuFolderOpen } from "react-icons/lu";

interface PathFieldProps {
	id: string;
	value: string;
	onChange: (value: string) => void;
	onBrowse: () => void;
	placeholder: string;
	disabled: boolean;
}

export function PathField({
	id,
	value,
	onChange,
	onBrowse,
	placeholder,
	disabled,
}: PathFieldProps) {
	const { t } = useLingui();
	return (
		<div className="flex gap-1.5">
			<Input
				id={id}
				value={value}
				onChange={(e) => onChange(e.target.value)}
				placeholder={placeholder}
				disabled={disabled}
				className="min-w-0 flex-1 font-mono text-sm"
			/>
			<Button
				type="button"
				variant="outline"
				size="icon"
				onClick={onBrowse}
				disabled={disabled}
				className="shrink-0"
				aria-label={t({ message: "Browse for directory" })}
			>
				<LuFolderOpen className="size-4" />
			</Button>
		</div>
	);
}
