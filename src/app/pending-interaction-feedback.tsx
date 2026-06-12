"use client";

import { usePathname, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";

const ACTION_SELECTOR =
  'a[href], button, input[type="submit"], input[type="button"], [role="button"]';
const LONG_FEEDBACK_MS = 30_000;
const SHORT_FEEDBACK_MS = 900;

type ActionControl = HTMLElement & {
  disabled?: boolean;
  type?: string;
};

function isActionControl(element: Element | null): element is ActionControl {
  return element instanceof HTMLElement;
}

function shouldIgnoreClick(event: MouseEvent, control: ActionControl) {
  if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) {
    return true;
  }

  if (control.dataset.pendingFeedback === "off") return true;
  if (control.disabled || control.getAttribute("aria-disabled") === "true") return true;

  if (control instanceof HTMLAnchorElement) {
    if (control.target && control.target !== "_self") return true;
    if (control.hasAttribute("download")) return true;
  }

  return false;
}

function isLongInteraction(control: ActionControl) {
  if (control.dataset.pendingFeedback === "long") return true;
  if (control instanceof HTMLAnchorElement) return true;

  return false;
}

function submitterFromEvent(event: Event) {
  if ("submitter" in event && event.submitter instanceof HTMLElement) {
    return event.submitter;
  }

  return null;
}

export function PendingInteractionFeedback() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [pending, setPending] = useState(false);
  const clearTimerRef = useRef<number | null>(null);
  const clearPendingRef = useRef<() => void>(() => undefined);
  const locationKey = `${pathname}?${searchParams.toString()}`;

  useEffect(() => {
    clearPendingRef.current();
  }, [locationKey]);

  useEffect(() => {
    function clearPending() {
      if (clearTimerRef.current !== null) {
        window.clearTimeout(clearTimerRef.current);
        clearTimerRef.current = null;
      }

      document
        .querySelectorAll<HTMLElement>("[data-pending-interaction]")
        .forEach((element) => {
          element.removeAttribute("data-pending-interaction");
        });
      document.documentElement.removeAttribute("data-interaction-pending");
      setPending(false);
    }

    function markPending(control: ActionControl, longRunning: boolean) {
      clearPending();
      control.setAttribute("data-pending-interaction", "true");
      document.documentElement.setAttribute("data-interaction-pending", "true");
      setPending(true);

      clearTimerRef.current = window.setTimeout(
        clearPending,
        longRunning ? LONG_FEEDBACK_MS : SHORT_FEEDBACK_MS,
      );
    }

    function onClick(event: MouseEvent) {
      const target = event.target instanceof Element ? event.target : null;
      const control = target ? target.closest(ACTION_SELECTOR) : null;

      if (!isActionControl(control) || shouldIgnoreClick(event, control)) return;
      markPending(control, isLongInteraction(control));
    }

    function onSubmit(event: Event) {
      const form = event.target instanceof HTMLFormElement ? event.target : null;
      if (!form || form.dataset.pendingFeedback === "off") return;

      const submitter = submitterFromEvent(event);
      const fallbackSubmitter = form.querySelector<HTMLElement>(
        'button[type="submit"], button:not([type]), input[type="submit"]',
      );
      const control = submitter ?? fallbackSubmitter;

      if (!isActionControl(control) || control.disabled) return;
      markPending(control, true);
    }

    clearPendingRef.current = clearPending;
    document.addEventListener("click", onClick, true);
    document.addEventListener("submit", onSubmit, true);
    window.addEventListener("pagehide", clearPending);
    window.addEventListener("pageshow", clearPending);

    return () => {
      document.removeEventListener("click", onClick, true);
      document.removeEventListener("submit", onSubmit, true);
      window.removeEventListener("pagehide", clearPending);
      window.removeEventListener("pageshow", clearPending);
      clearPending();
    };
  }, []);

  return (
    <>
      <div className="interaction-feedback-bar" aria-hidden="true" />
      <div className="sr-only" aria-live="polite" aria-atomic="true">
        {pending ? "Operazione in corso." : ""}
      </div>
    </>
  );
}
