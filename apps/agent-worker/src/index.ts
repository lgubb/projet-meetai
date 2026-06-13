import type { HealthStatus } from "@jean/shared";

const status: HealthStatus = {
  service: "agent-worker",
  ok: true
};

console.log(`${status.service} ready`);
