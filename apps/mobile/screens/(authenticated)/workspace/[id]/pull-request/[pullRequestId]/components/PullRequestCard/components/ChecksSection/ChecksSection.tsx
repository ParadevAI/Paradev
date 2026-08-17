import { Check } from "lucide-react-native";
import { Pressable, View } from "react-native";
import { Icon } from "@/components/ui/icon";
import { Text } from "@/components/ui/text";
import type {
	ChecksTally,
	PullRequestCheck,
} from "../../../../../../utils/pullRequest";
import { CheckRow } from "../../../CheckRow";
import { CardRow } from "../CardRow";
import { ChecksRing } from "../ChecksRing";

/**
 * Three voices, one per situation the designs show. While checks run it is a ring
 * and a count; once they settle with failures it lists what is wrong and hides
 * what is fine, with a way through to the rest; when everything passes it is a
 * single line.
 */
export function ChecksSection({
	tally,
	onOpenChecks,
	onOpenCheck,
}: {
	tally: ChecksTally;
	onOpenChecks?: () => void;
	onOpenCheck?: (check: PullRequestCheck) => void;
}) {
	if (tally.total === 0) return null;

	if (tally.failing.length > 0 && tally.running === 0) {
		return (
			<View className="gap-3">
				{tally.failing.map((check) => (
					<CheckRow
						check={check}
						key={check.name}
						onPress={onOpenCheck ? () => onOpenCheck(check) : undefined}
					/>
				))}
				{tally.total > tally.failing.length && onOpenChecks ? (
					<Pressable
						accessibilityRole="button"
						className="active:opacity-60"
						onPress={onOpenChecks}
					>
						<Text className="text-muted-foreground text-[15px]">View All</Text>
					</Pressable>
				) : null}
			</View>
		);
	}

	if (tally.running > 0) {
		return (
			<CardRow
				label={`${tally.passed}/${tally.total} Checks Passing`}
				leading={<ChecksRing tally={tally} />}
				onPress={onOpenChecks}
				subLabel={`${tally.running} Running`}
			/>
		);
	}

	return (
		<CardRow
			label={tally.passed > 0 ? "All Checks Passed" : "Checks Skipped"}
			leading={
				<View className="size-[26px] items-center justify-center rounded-full bg-green-500">
					<Icon
						as={Check}
						className="text-background size-3.5"
						strokeWidth={3.5}
					/>
				</View>
			}
			onPress={onOpenChecks}
		/>
	);
}
