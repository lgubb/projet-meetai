import type { HealthStatus } from "@jean/shared";
import type { ReactElement } from "react";

export type UiHealthStatus = HealthStatus;

export function UiPlaceholder(): ReactElement {
  return <div data-jean-ui="placeholder" />;
}
