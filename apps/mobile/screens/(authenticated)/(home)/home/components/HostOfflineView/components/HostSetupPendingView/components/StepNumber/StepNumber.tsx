import { Text } from "@/components/ui/text";

export function StepNumber({ step }: { step: number }) {
	return (
		<Text className="text-muted-foreground text-[14px] font-semibold">
			{step}
		</Text>
	);
}
