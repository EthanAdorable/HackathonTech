import { readFileSync } from "node:fs";

const component = readFileSync("components/tams-hub-app.tsx", "utf8");
const css = readFileSync("app/globals.css", "utf8");
const layout = readFileSync("app/layout.tsx", "utf8");

const checks = [
  ["global skip link exists", layout.includes('className="skip-link"') && layout.includes('href="#main-content"')],
  ["main content target exists", component.includes('id="main-content"')],
  ["skip link is visible on focus", css.includes(".skip-link:focus-visible")],
  ["notification popover can receive focus", component.includes("notificationPopoverRef") && component.includes("tabIndex={-1}")],
  ["notification popover closes with Escape", component.includes('event.key === "Escape"')],
  ["destructive actions require confirmation", component.match(/window\.confirm/g)?.length >= 2],
  ["required fields expose inline validation", component.includes("field-error") && component.includes("aria-invalid={missingRequiredField}")],
  ["reduced motion preference is respected", css.includes("@media (prefers-reduced-motion: reduce)")],
];

const failed = checks.filter(([, passed]) => !passed);

if (failed.length) {
  for (const [name] of failed) {
    console.error(`UX/a11y check failed: ${name}`);
  }
  process.exit(1);
}

console.log(`UX/a11y checks passed (${checks.length}).`);
