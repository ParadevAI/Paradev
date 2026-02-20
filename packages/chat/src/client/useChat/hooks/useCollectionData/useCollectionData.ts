import type { Collection } from "@tanstack/db";
import { useCallback, useRef, useSyncExternalStore } from "react";

type CollectionItem<C> =
	// biome-ignore lint/suspicious/noExplicitAny: TanStack DB Collection has 5 type params; only T matters here
	C extends Collection<infer T, any, any, any, any> ? T : never;

const EMPTY: never[] = [];

export function useCollectionData<
	// biome-ignore lint/suspicious/noExplicitAny: TanStack DB Collection generic constraint
	C extends Collection<any, any, any, any, any>,
>(collection: C | null): CollectionItem<C>[] {
	type T = CollectionItem<C>;

	const versionRef = useRef(0);
	const snapshotRef = useRef<{ version: number; data: T[] }>({
		version: -1,
		data: [],
	});

	const prevCollectionRef = useRef(collection);
	if (prevCollectionRef.current !== collection) {
		prevCollectionRef.current = collection;
		versionRef.current++;
	}

	const subscribe = useCallback(
		(onStoreChange: () => void): (() => void) => {
			if (!collection) return () => {};
			const subscription = collection.subscribeChanges(() => {
				versionRef.current++;
				onStoreChange();
			});
			return () => subscription.unsubscribe();
		},
		[collection],
	);

	const getSnapshot = useCallback((): T[] => {
		if (!collection) return EMPTY as T[];
		const currentVersion = versionRef.current;
		const cached = snapshotRef.current;
		if (cached.version === currentVersion) return cached.data;
		const data = [...collection.values()] as T[];
		snapshotRef.current = { version: currentVersion, data };
		return data;
	}, [collection]);

	return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}
