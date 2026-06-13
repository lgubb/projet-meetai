#!/usr/bin/env node

import type { HealthStatus } from "@jean/shared";

export function run(): HealthStatus {
  return {
    service: "bridge-cli",
    ok: true
  };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const status = run();

  console.log(`${status.service} ready`);
}
