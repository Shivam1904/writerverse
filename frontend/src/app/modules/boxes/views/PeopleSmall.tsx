import { avatarColor, initial } from '../avatar';

/** People box — default view. People is the focus: clean entity units laid
 *  across the featured box's full width (bigger avatars), from get_characters. */
export function PeopleSmall({ data }) {
  return (
    <div className="wv2-people">
      {data.map((p) => (
        <div className="wv2-person" key={p.id ?? p.name}>
          <span className="wv2-av" style={{ background: avatarColor(p.name) }}>
            {initial(p.name)}
          </span>
          <div className="wv2-entity-info">
            <div className="wv2-nm">{p.name}</div>
            {(p.type || p.description) && (
              <div className="wv2-role">{p.type || p.description}</div>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
