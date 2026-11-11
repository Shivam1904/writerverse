import type { ComponentType } from 'react';
import { FileText } from 'lucide-react';

/** Stand-in for a not-yet-built section. Pages get built one by one. */
export function Placeholder({ title, icon }: { title: string; icon?: ComponentType<any> }) {
  const Icon = icon ?? FileText;
  return (
    <div className="wv2-placeholder">
      <div className="wv2-placeholder-chip">
        <Icon size={32} strokeWidth={1.5} />
      </div>
      <h1 className="wv2-placeholder-title">{title}</h1>
      <p className="wv2-placeholder-note">Not built yet — coming one page at a time.</p>
    </div>
  );
}
