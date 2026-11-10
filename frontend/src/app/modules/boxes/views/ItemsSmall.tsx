import { Package } from 'lucide-react';

/** Items box — 'small' view. Items from discovery (get_items → {name, description}). */
export function ItemsSmall({ data }) {
  return (
    <div className="wv2-entity-list">
      {data.map((t, i) => (
        <div className="wv2-entity" key={t.name ?? i}>
          <span className="wv2-glyph">
            <Package size={16} strokeWidth={1.6} />
          </span>
          <div className="wv2-entity-info">
            <div className="wv2-nm">{t.name}</div>
            {t.description && <div className="wv2-role">{t.description}</div>}
          </div>
        </div>
      ))}
    </div>
  );
}
