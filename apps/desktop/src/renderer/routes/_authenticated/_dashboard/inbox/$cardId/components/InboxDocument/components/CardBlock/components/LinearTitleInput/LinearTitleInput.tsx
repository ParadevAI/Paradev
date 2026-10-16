import { useLingui } from "@lingui/react/macro";

interface LinearTitleInputProps {
	value: string;
	onChange: (next: string) => void;
	disabled?: boolean;
}

/** An issue's title as a field; an empty one is marked, because Linear takes no issue without a title. */
export function LinearTitleInput({
	value,
	onChange,
	disabled,
}: LinearTitleInputProps) {
	const { t } = useLingui();
	return (
		<input
			value={value}
			onChange={(event) => onChange(event.target.value)}
			disabled={disabled}
			aria-label={t({ message: "Title" })}
			aria-invalid={value.trim() === "" || undefined}
			className="h-8 rounded-md border border-input bg-background px-2 text-sm font-medium text-foreground outline-none focus:border-foreground/40 aria-invalid:border-destructive"
		/>
	);
}
