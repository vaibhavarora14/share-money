// TypeScript resolves this neutral module while Metro selects the adjacent
// `.native.ts` or `.web.ts` implementation for the running platform.
export * from "./pushNotifications.web";
