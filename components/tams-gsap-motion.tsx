"use client";

import { useGSAP } from "@gsap/react";
import gsap from "gsap";
import { usePathname } from "next/navigation";
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type DependencyList,
  type FocusEventHandler,
  type MutableRefObject,
  type PointerEventHandler,
  type RefObject,
} from "react";

gsap.registerPlugin(useGSAP);

type ScopeRef<TElement extends Element = HTMLElement> =
  | RefObject<TElement>
  | MutableRefObject<TElement | null>;

type ContextSafe = ReturnType<typeof useGSAP>["contextSafe"];

type TamsGsapCleanup = (() => void) | void;

type OptionalScrollTrigger = {
  refresh?: () => void;
};

export type TamsGsapHelpers<TElement extends Element = HTMLElement> = {
  context: gsap.Context;
  contextSafe: ContextSafe;
  gsap: typeof gsap;
  prefersReducedMotion: boolean;
  refresh: () => void;
  scope: TElement | null;
};

export type TamsGsapOptions = {
  dependencies?: DependencyList;
  refreshKey?: unknown;
  refreshOnRouteChange?: boolean;
  revertOnUpdate?: boolean;
  skipWhenReducedMotion?: boolean;
};

export type GsapRefreshOptions = {
  delay?: number;
  disabled?: boolean;
  includeRoute?: boolean;
  refreshKey?: unknown;
};

export type MicroMotionOptions = {
  disabled?: boolean;
  focusScale?: number;
  hoverScale?: number;
  hoverY?: number;
  pressScale?: number;
  reducedMotionScale?: number;
  tapY?: number;
};

const DEFAULT_MICRO_MOTION = {
  focusScale: 1.01,
  hoverScale: 1.015,
  hoverY: -2,
  pressScale: 0.985,
  reducedMotionScale: 1.005,
  tapY: 0,
} satisfies Required<Omit<MicroMotionOptions, "disabled">>;

function getMediaQueryList(query: string) {
  if (typeof window === "undefined" || !("matchMedia" in window)) {
    return null;
  }

  return window.matchMedia(query);
}

export function getPrefersReducedMotion() {
  return getMediaQueryList("(prefers-reduced-motion: reduce)")?.matches ?? false;
}

export function refreshGsapLayout() {
  if (typeof window === "undefined") {
    return;
  }

  gsap.matchMediaRefresh();

  const core = gsap.core as typeof gsap.core & {
    globals?: () => Record<string, OptionalScrollTrigger | undefined>;
  };
  const globals = core.globals?.() ?? {};
  globals.ScrollTrigger?.refresh?.();
}

export function usePrefersReducedMotion() {
  const [prefersReducedMotion, setPrefersReducedMotion] = useState(getPrefersReducedMotion);

  useEffect(() => {
    const mediaQuery = getMediaQueryList("(prefers-reduced-motion: reduce)");

    if (!mediaQuery) {
      return undefined;
    }

    const updatePreference = () => {
      setPrefersReducedMotion(mediaQuery.matches);
    };

    updatePreference();
    mediaQuery.addEventListener("change", updatePreference);

    return () => {
      mediaQuery.removeEventListener("change", updatePreference);
    };
  }, []);

  return prefersReducedMotion;
}

export function useGsapRefresh({
  delay = 0,
  disabled = false,
  includeRoute = true,
  refreshKey,
}: GsapRefreshOptions = {}) {
  const pathname = usePathname();
  const routeKey = includeRoute ? pathname : null;

  useEffect(() => {
    if (disabled) {
      return undefined;
    }

    const timeoutId = window.setTimeout(refreshGsapLayout, delay);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [delay, disabled, refreshKey, routeKey]);
}

export function useTamsGsap<TElement extends HTMLElement = HTMLElement>(
  scope: ScopeRef<TElement>,
  animate: (helpers: TamsGsapHelpers<TElement>) => TamsGsapCleanup,
  {
    dependencies = [],
    refreshKey,
    refreshOnRouteChange = true,
    revertOnUpdate = true,
    skipWhenReducedMotion = true,
  }: TamsGsapOptions = {},
) {
  const prefersReducedMotion = usePrefersReducedMotion();

  useGsapRefresh({
    disabled: skipWhenReducedMotion && prefersReducedMotion,
    includeRoute: refreshOnRouteChange,
    refreshKey,
  });

  useGSAP(
    (context, contextSafe) => {
      if (skipWhenReducedMotion && prefersReducedMotion) {
        gsap.set(context.selector?.("[data-gsap-reveal]") ?? [], { clearProps: "all" });
        return undefined;
      }

      return animate({
        context,
        contextSafe: contextSafe ?? ((callback) => callback),
        gsap,
        prefersReducedMotion,
        refresh: refreshGsapLayout,
        scope: scope.current,
      });
    },
    {
      dependencies: [prefersReducedMotion, refreshKey, ...dependencies],
      revertOnUpdate,
      scope,
    },
  );

  return {
    gsap,
    prefersReducedMotion,
    refresh: refreshGsapLayout,
  };
}

export function createRevealTimeline(
  scope: Element,
  {
    distance = 18,
    duration = 0.55,
    ease = "power2.out",
    selector = "[data-gsap-reveal]",
    stagger = 0.06,
  }: {
    distance?: number;
    duration?: number;
    ease?: string;
    selector?: string;
    stagger?: number;
  } = {},
) {
  const targets = gsap.utils.toArray<HTMLElement>(selector, scope);

  return gsap.timeline().from(targets, {
    autoAlpha: 0,
    duration,
    ease,
    stagger,
    y: distance,
  });
}

export function useGsapMicroMotion<TElement extends HTMLElement = HTMLElement>({
  disabled = false,
  focusScale = DEFAULT_MICRO_MOTION.focusScale,
  hoverScale = DEFAULT_MICRO_MOTION.hoverScale,
  hoverY = DEFAULT_MICRO_MOTION.hoverY,
  pressScale = DEFAULT_MICRO_MOTION.pressScale,
  reducedMotionScale = DEFAULT_MICRO_MOTION.reducedMotionScale,
  tapY = DEFAULT_MICRO_MOTION.tapY,
}: MicroMotionOptions = {}) {
  const ref = useRef<TElement | null>(null);
  const prefersReducedMotion = usePrefersReducedMotion();
  const { contextSafe } = useGSAP({ scope: ref });

  const tweenTo = contextSafe((scale: number, y = 0) => {
    if (!ref.current || disabled) {
      return;
    }

    gsap.to(ref.current, {
      duration: prefersReducedMotion ? 0.12 : 0.18,
      ease: "power2.out",
      overwrite: "auto",
      scale,
      y: prefersReducedMotion ? 0 : y,
    });
  });

  const hoverTargetScale = prefersReducedMotion ? reducedMotionScale : hoverScale;
  const focusTargetScale = prefersReducedMotion ? reducedMotionScale : focusScale;

  return useMemo(
    () => ({
      motionProps: {
        onBlur: (() => tweenTo(1)) satisfies FocusEventHandler<TElement>,
        onFocus: (() => tweenTo(focusTargetScale)) satisfies FocusEventHandler<TElement>,
        onPointerCancel: (() => tweenTo(1)) satisfies PointerEventHandler<TElement>,
        onPointerDown: (() => tweenTo(pressScale, tapY)) satisfies PointerEventHandler<TElement>,
        onPointerEnter: (() => tweenTo(hoverTargetScale, hoverY)) satisfies PointerEventHandler<TElement>,
        onPointerLeave: (() => tweenTo(1)) satisfies PointerEventHandler<TElement>,
        onPointerUp: (() => tweenTo(hoverTargetScale, hoverY)) satisfies PointerEventHandler<TElement>,
        ref,
      },
      prefersReducedMotion,
      ref,
    }),
    [focusTargetScale, hoverTargetScale, hoverY, prefersReducedMotion, pressScale, tapY, tweenTo],
  );
}
