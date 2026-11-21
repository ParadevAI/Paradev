import type { ComponentType } from "react";

/** Mounted once at the app root; draws `showActionSheet` where the platform has no native sheet to call. */
export type ActionSheetHostComponent = ComponentType;
