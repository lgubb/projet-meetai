import assert from "node:assert/strict";
import test from "node:test";

import { getAuthMode } from "./auth.js";

test("auth mode defaults to dev when Clerk is not configured", () => {
  withAuthEnv(
    {
      CLERK_SECRET_KEY: undefined,
      WORKROOM_AUTH_MODE: undefined
    },
    () => {
      assert.equal(getAuthMode(), "dev");
    }
  );
});

test("auth mode defaults to Clerk when Clerk is configured", () => {
  withAuthEnv(
    {
      CLERK_SECRET_KEY: "sk_test_mock",
      WORKROOM_AUTH_MODE: undefined
    },
    () => {
      assert.equal(getAuthMode(), "clerk");
    }
  );
});

test("auth mode can force local dev auth even when Clerk is configured", () => {
  withAuthEnv(
    {
      CLERK_SECRET_KEY: "sk_test_mock",
      WORKROOM_AUTH_MODE: "dev"
    },
    () => {
      assert.equal(getAuthMode(), "dev");
    }
  );
});

test("auth mode rejects invalid explicit values", () => {
  withAuthEnv(
    {
      CLERK_SECRET_KEY: undefined,
      WORKROOM_AUTH_MODE: "local"
    },
    () => {
      assert.throws(() => getAuthMode(), /WORKROOM_AUTH_MODE/);
    }
  );
});

function withAuthEnv(
  values: {
    CLERK_SECRET_KEY: string | undefined;
    WORKROOM_AUTH_MODE: string | undefined;
  },
  callback: () => void
): void {
  const previousClerkSecret = process.env.CLERK_SECRET_KEY;
  const previousAuthMode = process.env.WORKROOM_AUTH_MODE;

  setEnvValue("CLERK_SECRET_KEY", values.CLERK_SECRET_KEY);
  setEnvValue("WORKROOM_AUTH_MODE", values.WORKROOM_AUTH_MODE);

  try {
    callback();
  } finally {
    setEnvValue("CLERK_SECRET_KEY", previousClerkSecret);
    setEnvValue("WORKROOM_AUTH_MODE", previousAuthMode);
  }
}

function setEnvValue(name: string, value: string | undefined): void {
  if (value === undefined) {
    delete process.env[name];
    return;
  }

  process.env[name] = value;
}
