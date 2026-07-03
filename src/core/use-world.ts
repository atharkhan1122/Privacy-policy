"use client";

import { useSyncExternalStore } from "react";
import { subscribeWorld, worldSnapshot, worldVersion, type World } from "./store";

/**
 * React subscription to the world. The store itself is framework-free (the
 * API plane imports it server-side); this thin client module is the only
 * place React touches it.
 */
export function useWorld(): { world: Readonly<World>; version: number } {
  const version = useSyncExternalStore(subscribeWorld, worldVersion, () => 0);
  return { world: worldSnapshot(), version };
}
