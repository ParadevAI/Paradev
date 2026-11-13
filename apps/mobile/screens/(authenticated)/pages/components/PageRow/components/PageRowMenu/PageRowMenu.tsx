import { useLingui } from "@lingui/react/macro";
import { Link } from "expo-router";
import type { ReactNode } from "react";
import { View } from "react-native";
import type { PageActions } from "../../../../hooks/usePageActions";

export function PageRowMenu({
	actions,
	children,
}: {
	actions: PageActions;
	children: ReactNode;
}) {
	const { t } = useLingui();
	// Tap navigation lives on the row itself; the Link exists solely because
	// Link.Menu must be a direct child of Link, so tap is a no-op here.
	return (
		<Link
			href="/(authenticated)/pages"
			onPress={(event) => event.preventDefault()}
			asChild
		>
			<Link.Trigger>
				<View collapsable={false}>{children}</View>
			</Link.Trigger>
			<Link.Menu>
				<Link.MenuAction icon="square.and.arrow.up" onPress={actions.share}>
					{t({ message: "Share" })}
				</Link.MenuAction>
				<Link.MenuAction
					icon="plus.square.on.square"
					onPress={actions.duplicate}
				>
					{t({ message: "Duplicate" })}
				</Link.MenuAction>
				{actions.rename ? (
					<Link.MenuAction icon="pencil" onPress={actions.rename}>
						{t({ message: "Rename" })}
					</Link.MenuAction>
				) : null}
				{actions.remove ? (
					<Link.MenuAction icon="trash" destructive onPress={actions.remove}>
						{t({ message: "Delete" })}
					</Link.MenuAction>
				) : null}
			</Link.Menu>
		</Link>
	);
}
