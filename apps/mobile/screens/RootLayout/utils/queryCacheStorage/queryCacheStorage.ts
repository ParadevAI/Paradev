import AsyncStorage from "@react-native-async-storage/async-storage";
import type { QueryCacheStorage } from "./queryCacheStorage.types";

export const queryCacheStorage: QueryCacheStorage = AsyncStorage;
