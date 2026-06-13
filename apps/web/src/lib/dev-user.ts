import type { DevUser } from "./workroom-api";

export const defaultDevUser: DevUser = {
  email: "owner@example.com",
  name: "Owner"
};

const userStorageKey = "jean-workroom-dev-user";

export function readSavedDevUser(): DevUser {
  if (typeof window === "undefined") {
    return defaultDevUser;
  }

  const savedValue = localStorage.getItem(userStorageKey);

  if (!savedValue) {
    return defaultDevUser;
  }

  try {
    const parsed = JSON.parse(savedValue) as Partial<DevUser>;

    return {
      email: typeof parsed.email === "string" && parsed.email.trim() ? parsed.email : defaultDevUser.email,
      name: typeof parsed.name === "string" ? parsed.name : defaultDevUser.name
    };
  } catch {
    return defaultDevUser;
  }
}

export function saveDevUser(user: DevUser): void {
  localStorage.setItem(userStorageKey, JSON.stringify(user));
}
