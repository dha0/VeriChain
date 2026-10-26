"use client";

import { useEffect, useRef } from "react";

/**
 * Custom hook that runs a polling callback every intervalMs (default 45s),
 * automatically pausing when the tab is hidden and resuming/firing immediately
 * when the tab returns to focus. Stops immediately when enabled is false (e.g. on logout).
 */
export function useVisibilityPolling(
  callback: () => Promise<void> | void,
  intervalMs = 45000,
  enabled = true
) {
  const savedCallback = useRef(callback);
  savedCallback.current = callback;

  useEffect(() => {
    if (!enabled) return;

    let timer: NodeJS.Timeout | null = null;

    const startTimer = () => {
      if (timer) clearInterval(timer);
      timer = setInterval(() => {
        savedCallback.current();
      }, intervalMs);
    };

    const stopTimer = () => {
      if (timer) {
        clearInterval(timer);
        timer = null;
      }
    };

    const handleVisibilityChange = () => {
      if (document.hidden) {
        // Tab is hidden: pause polling to save resources
        stopTimer();
      } else {
        // Tab became visible: immediately refresh data and restart timer
        savedCallback.current();
        startTimer();
      }
    };

    // Initial timer start
    startTimer();
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      stopTimer();
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [intervalMs, enabled]);
}
