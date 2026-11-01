import "server-only";

export function isRegistrationEnabled() {
  return process.env.REGISTRATION_ENABLED === "true";
}
