import * as Application from "expo-application";
import type { AppVersion } from "./appVersion.types";

export const APP_VERSION: AppVersion =
	Application.nativeApplicationVersion ?? "0.0.0";
