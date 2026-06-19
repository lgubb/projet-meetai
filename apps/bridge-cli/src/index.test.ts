import assert from "node:assert/strict";
import test from "node:test";

import { parseDoctorArgs, parseGlobalArgs } from "./index.js";

test("global arg parsing accepts pnpm's script separator before the command", () => {
  assert.deepEqual(parseGlobalArgs(["--", "pair", "--api-url", "http://127.0.0.1:3001"]), {
    configPath: undefined,
    args: ["pair", "--api-url", "http://127.0.0.1:3001"]
  });
});

test("doctor arg parsing accepts api url and skip flags", () => {
  assert.deepEqual(parseDoctorArgs(["--api-url", "http://127.0.0.1:3001/", "--skip-codex", "--skip-api"]), {
    apiUrl: "http://127.0.0.1:3001",
    skipApi: true,
    skipCodex: true
  });
  assert.deepEqual(parseDoctorArgs(["--api-url=https://workroom.example"]), {
    apiUrl: "https://workroom.example",
    skipApi: false,
    skipCodex: false
  });
});

test("doctor arg parsing rejects unknown options", () => {
  assert.throws(() => parseDoctorArgs(["--unknown"]), /Unknown jean-bridge doctor option/);
});
