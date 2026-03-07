"use client";

import { useSyncExternalStore } from "react";

const EVENT_NAME = "ck-selected-team-changed";

function readSelectedTeamId(): string {
  if (typeof window === "undefined") return "";
  try {
    return (localStorage.getItem("ck-selected-team") || "").trim();
  } catch {
    return "";
  }
}

function subscribe(cb: () => void) {
  if (typeof window === "undefined") return () => {};

  const handler = () => cb();

  // `storage` only fires across documents; we also dispatch a same-tab custom event.
  window.addEventListener("storage", handler);
  window.addEventListener(EVENT_NAME, handler);

  return () => {
    window.removeEventListener("storage", handler);
    window.removeEventListener(EVENT_NAME, handler);
  };
}

export function useSelectedTeamId(): string {
  return useSyncExternalStore(subscribe, readSelectedTeamId, () => "");
}

export function dispatchSelectedTeamChanged() {
  if (typeof window === "undefined") return;
  try {
    window.dispatchEvent(new Event(EVENT_NAME));
  } catch {
    // ignore
  }
}
