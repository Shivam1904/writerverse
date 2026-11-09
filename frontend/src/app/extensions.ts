/**
 * Extensions: the one place the app reads its plug-in slots.
 *
 * The build picks ONE extension module through the `@writerverse/extensions`
 * alias (frontend/extensions.config.ts). With no extension (`src/extensions/none.ts`)
 * every slot is empty and the app works on its own. A hosted build can plug in
 * extra pages, a top-bar chip, overlays and so on, without the core knowing
 * what they are. Every slot is optional.
 */
import type { ComponentType, ReactElement, ReactNode } from 'react';
import loaded from '@writerverse/extensions';

export interface ExtensionRoute {
  path: string;
  element: ReactElement;
  /** 'protected' = signed-in users only (the default); 'public' = anyone. */
  auth?: 'protected' | 'public';
}

export interface ExtensionMenuItem {
  label: string;
  to: string;
  /** Optional icon for the older account dropdown (components/UserDropdown.tsx). */
  icon?: ReactNode;
}

/** Terms shown at sign-up. When set, the form shows an "I accept" checkbox. */
export interface SignupTerms {
  heading: string;
  /** The full terms, shown in a dialog from the checkbox row. */
  body: ReactNode;
  /** Text before the link, e.g. "I accept the". */
  checkboxLabel: string;
  /** The link that opens `body`, e.g. "Terms and Conditions". */
  linkLabel: string;
  /** Block "Create account" until the box is ticked. */
  required?: boolean;
}

export interface Extensions {
  /** Extra pages (App.tsx). */
  routes?: ExtensionRoute[];
  /** Items in the project top bar, left of the bell (Topbar.tsx). */
  topbarItems?: ComponentType<{ projectId: string }>[];
  /** Extra links in the user menus (Topbar.tsx, components/UserDropdown.tsx). */
  userMenuItems?: ExtensionMenuItem[];
  /** Rendered once inside every project page (ProjectShell.tsx): modals, banners. */
  shellOverlays?: ComponentType<{ projectId?: string }>[];
  /** Rendered on the library page (Library.tsx). */
  libraryOverlays?: ComponentType<{ justSignedUp: boolean; onClose: () => void }>[];
  /** A hook: the short label for what one run of an AI feature costs ('' = none). */
  useCostLabel?: (feature: string) => string;
  /** Sees every failed API call first (gateway.ts, chat stream). true = handled, show no toast. */
  handleApiError?: (status: number | undefined, body: any) => boolean;
  signupTerms?: SignupTerms;
  /** Runs once at startup (main.tsx), e.g. to add HTTP interceptors. */
  setup?: () => void;
}

export const extensions: Extensions = loaded;

let _setupDone = false;
/** Runs the extension's setup once. Called from main.tsx. */
export function setupExtensions() {
  if (_setupDone) return;
  _setupDone = true;
  extensions.setup?.();
}

/** Lets the extension take a failed API call. true = it handled it (no toast). */
export function handleApiError(status: number | undefined, body: any): boolean {
  return extensions.handleApiError?.(status, body) ?? false;
}
