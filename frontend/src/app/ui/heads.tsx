import * as React from 'react';
import { cn } from '../lib/utils';

/**
 * ContainerHead — icon-in-a-BOX (lit tile) + heading + subheading. For a nested
 * container (a section inside a container).
 */
export function ContainerHead({
  icon, title, subtitle, className,
}: {
  icon: React.ReactNode;
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('kit-containerhead', className)}>
      <span className="kit-head-box">{icon}</span>
      <div className="min-w-0">
        <div className="kit-head-title truncate">{title}</div>
        {subtitle && <div className="kit-head-sub">{subtitle}</div>}
      </div>
    </div>
  );
}

/**
 * RailHead — a bare glyph (NO box, NO border — usually a glossy world-rail mark)
 * + title + subtitle/list + an optional action on the right (e.g. collapse).
 * For rails.
 */
export function RailHead({
  icon, title, subtitle, action, className,
}: {
  icon: React.ReactNode;
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('kit-railhead', className)}>
      <div className="kit-railhead-brand">
        <span className="kit-head-mark">{icon}</span>
        <div className="min-w-0">
          <div className="kit-head-title">{title}</div>
          {subtitle && <div className="kit-railhead-sub">{subtitle}</div>}
        </div>
      </div>
      {action}
    </div>
  );
}

/**
 * PageHead (#3) — eyebrow + lit concept glyph + title + muted suffix + an
 * optional right-aligned action cluster. For page headers.
 */
export function PageHead({
  eyebrow, icon, title, suffix, actions, className,
}: {
  eyebrow?: React.ReactNode;
  icon?: React.ReactNode;
  title: React.ReactNode;
  suffix?: React.ReactNode;
  actions?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('kit-pagehead', className)}>
      <div className="min-w-0">
        {eyebrow && <div className="kit-pagehead-eyebrow">{eyebrow}</div>}
        <h1 className="kit-pagehead-title">
          {icon && <span className="kit-pagehead-glyph">{icon}</span>}
          {title}
          {suffix != null && <span className="kit-pagehead-suffix">{suffix}</span>}
        </h1>
      </div>
      {actions && <div className="kit-pagehead-actions">{actions}</div>}
    </div>
  );
}
