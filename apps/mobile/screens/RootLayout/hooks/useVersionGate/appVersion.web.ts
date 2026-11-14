import Constants from "expo-constants";
import type { AppVersion } from "./appVersion.types";

export const APP_VERSION: AppVersion = Constants.expoConfig?.version ?? "0.0.0";
