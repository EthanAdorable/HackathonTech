"use client";

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import gsap from "gsap";
import { useGSAP } from "@gsap/react";

gsap.registerPlugin(useGSAP);

const reducedMotionQuery = "(prefers-reduced-motion: reduce)";

const revealSelectors = [
  ".access-hero .brand",
  ".access-hero h1",
  ".access-hero p",
  ".hero-metric",
  ".access-panel-wrap > *",
  ".sidebar .brand",
  ".logged-card",
  ".nav-button",
  ".signout-button",
  ".topbar h1",
  ".notification-wrap",
  ".topbar-identity",
  ".top-actions > .primary-button",
  ".screen-stack > *",
  ".file-layout > *",
  ".messages-layout > *",
  ".stat-card",
  ".guide-alert",
  ".service-card",
  ".admin-card",
  ".table-card",
  "tbody tr",
  ".panel",
  ".requirement-upload-card",
  ".file-meta",
  ".empty-upload-state",
  ".template-card",
  ".guide-card",
  ".warning-box",
  ".verification-summary",
  ".guide-says",
  ".status-card",
  ".progress-step",
  ".applications-layout > *",
  ".required-action",
  ".action-stack",
  ".reviewer-card",
  ".review-file-row",
  ".application-card",
  ".thread-item",
  ".chat-panel > *",
  ".chat-bubble",
  ".composer-row",
  ".partner-card",
  ".partner-chip",
  ".guide-hero",
  ".guide-hero-mark",
  ".feature-card",
  ".sdg-section > *",
  ".sdg-card",
  ".guide-workbench",
  ".guide-controls > *",
  ".guide-output",
  ".guide-output-lines p",
  ".guide-history-heading",
  ".guide-history-item",
].join(",");

const interactiveSelector = [
  "button:not(:disabled)",
  ".upload-control:not(:has(input:disabled))",
  "tbody tr[role='button']",
  ".template-card summary",
  ".application-card",
  ".thread-item",
  ".partner-chip",
  ".role-chip",
  ".access-method",
].join(",");

function prefersReducedMotion() {
  if (typeof window === "undefined") return true;
  return window.matchMedia(reducedMotionQuery).matches;
}

function useReducedMotion() {
  const [reduced, setReduced] = useState(true);

  useEffect(() => {
    const mediaQuery = window.matchMedia(reducedMotionQuery);
    const update = () => setReduced(mediaQuery.matches);
    update();
    mediaQuery.addEventListener("change", update);
    return () => mediaQuery.removeEventListener("change", update);
  }, []);

  return reduced;
}

function uniqueElements<TElement extends Element>(elements: TElement[]) {
  return elements.filter((element, index, list) => list.indexOf(element) === index);
}

function collectRevealTargets(scope: HTMLElement) {
  return uniqueElements(Array.from(scope.querySelectorAll(revealSelectors))).filter((element) => {
    if (!(element instanceof HTMLElement)) return false;
    if (element.closest("[aria-live]") && !element.matches(".guide-output-lines p, .guide-says p, .guide-history-item")) {
      return false;
    }
    return element.offsetParent !== null || element.matches(".notification-popover");
  }) as HTMLElement[];
}

function animateReveal(elements: HTMLElement[], delay = 0) {
  if (!elements.length) return;
  gsap.fromTo(
    elements,
    { autoAlpha: 0, y: 10, scale: 0.992 },
    {
      autoAlpha: 1,
      y: 0,
      scale: 1,
      duration: 0.24,
      delay,
      ease: "power2.out",
      stagger: { each: 0.018, from: "start" },
      overwrite: "auto",
      clearProps: "transform,opacity,visibility",
    },
  );
}

function animateProgress(scope: HTMLElement) {
  const bars = Array.from(scope.querySelectorAll<HTMLElement>(".progress-track span"));
  if (!bars.length) return;
  gsap.fromTo(
    bars,
    { scaleX: 0, transformOrigin: "left center" },
    { scaleX: 1, duration: 0.32, ease: "power2.out", overwrite: "auto", clearProps: "transform" },
  );
}

function animateNumbers(scope: HTMLElement) {
  const numbers = Array.from(scope.querySelectorAll<HTMLElement>(".stat-card strong, .hero-metric strong"));
  numbers.forEach((element) => {
    const finalText = element.textContent?.trim() ?? "";
    const match = finalText.match(/^(\d+(?:\.\d+)?)(.*)$/);
    if (!match) return;
    const target = Number(match[1]);
    if (!Number.isFinite(target)) return;
    const decimals = match[1].includes(".") ? match[1].split(".")[1].length : 0;
    const suffix = match[2] ?? "";
    const state = { value: 0 };
    gsap.to(state, {
      value: target,
      duration: 0.34,
      ease: "power2.out",
      overwrite: "auto",
      onUpdate: () => {
        element.textContent = `${state.value.toFixed(decimals)}${suffix}`;
      },
      onComplete: () => {
        element.textContent = finalText;
      },
    });
  });
}

function animatePopover(scope: HTMLElement) {
  const popover = scope.querySelector<HTMLElement>(".notification-popover");
  if (!popover) return;
  gsap.fromTo(
    popover,
    { autoAlpha: 0, y: -6, scale: 0.98 },
    { autoAlpha: 1, y: 0, scale: 1, duration: 0.16, ease: "power2.out", overwrite: "auto", clearProps: "transform,opacity,visibility" },
  );
}

export function GsapMotionScope({ children, motionKey }: { children: ReactNode; motionKey: string }) {
  const scopeRef = useRef<HTMLDivElement>(null);
  const reducedMotion = useReducedMotion();
  const stableMotionKey = useMemo(() => motionKey, [motionKey]);

  useGSAP(
    () => {
      const scope = scopeRef.current;
      if (!scope) return;
      if (reducedMotion) {
        gsap.set(collectRevealTargets(scope), { clearProps: "all" });
        gsap.set(scope.querySelectorAll(".progress-track span"), { clearProps: "all" });
        return;
      }

      animateReveal(collectRevealTargets(scope));
      animateProgress(scope);
      animateNumbers(scope);
      animatePopover(scope);
    },
    { scope: scopeRef, dependencies: [stableMotionKey, reducedMotion], revertOnUpdate: true },
  );

  useEffect(() => {
    const scope = scopeRef.current;
    if (!scope || reducedMotion) return;

    const observer = new MutationObserver((mutations) => {
      const addedTargets = mutations.flatMap((mutation) =>
        Array.from(mutation.addedNodes).flatMap((node) => {
          if (!(node instanceof HTMLElement)) return [];
          const matches = node.matches(revealSelectors) ? [node] : [];
          return [...matches, ...Array.from(node.querySelectorAll<HTMLElement>(revealSelectors))];
        }),
      );

      animateReveal(uniqueElements(addedTargets), 0.02);
      animateProgress(scope);
      animatePopover(scope);
    });

    observer.observe(scope, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, [reducedMotion]);

  useEffect(() => {
    const scope = scopeRef.current;
    if (!scope || reducedMotion) return;

    const root = scope;

    function motionTarget(event: Event) {
      const target = event.target;
      if (!(target instanceof Element)) return null;
      const element = target.closest(interactiveSelector);
      return element instanceof HTMLElement && root.contains(element) ? element : null;
    }

    function lift(event: Event) {
      const element = motionTarget(event);
      if (!element || element.matches(":disabled")) return;
      gsap.to(element, { y: -1, scale: 1.012, duration: 0.14, ease: "power2.out", overwrite: "auto" });
    }

    function settle(event: Event) {
      const element = motionTarget(event);
      if (!element) return;
      gsap.to(element, { y: 0, scale: 1, duration: 0.16, ease: "power2.out", overwrite: "auto", clearProps: "transform" });
    }

    function press(event: Event) {
      const element = motionTarget(event);
      if (!element || element.matches(":disabled")) return;
      gsap.to(element, { scale: 0.985, duration: 0.08, ease: "power2.out", overwrite: "auto" });
    }

    root.addEventListener("pointerenter", lift, true);
    root.addEventListener("pointerleave", settle, true);
    root.addEventListener("focusin", lift);
    root.addEventListener("focusout", settle);
    root.addEventListener("pointerdown", press, true);
    root.addEventListener("pointerup", lift, true);
    root.addEventListener("pointercancel", settle, true);

    return () => {
      root.removeEventListener("pointerenter", lift, true);
      root.removeEventListener("pointerleave", settle, true);
      root.removeEventListener("focusin", lift);
      root.removeEventListener("focusout", settle);
      root.removeEventListener("pointerdown", press, true);
      root.removeEventListener("pointerup", lift, true);
      root.removeEventListener("pointercancel", settle, true);
    };
  }, [reducedMotion]);

  useEffect(() => {
    const scope = scopeRef.current;
    if (!scope) return;

    function keepFocusVisible(event: FocusEvent) {
      const target = event.target;
      if (!(target instanceof HTMLElement)) return;
      if (target.classList.contains("skip-link")) return;
      const rect = target.getBoundingClientRect();
      const topMargin = 78;
      const bottomMargin = 86;
      if (rect.top < topMargin || rect.bottom > window.innerHeight - bottomMargin) {
        target.scrollIntoView({ block: "nearest", inline: "nearest", behavior: "auto" });
      }
    }

    scope.addEventListener("focusin", keepFocusVisible);
    return () => scope.removeEventListener("focusin", keepFocusVisible);
  }, []);

  return (
    <div className="gsap-motion-scope" data-reduced-motion={reducedMotion ? "true" : "false"} ref={scopeRef}>
      {children}
    </div>
  );
}

export { prefersReducedMotion };
