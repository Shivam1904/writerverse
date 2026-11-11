// Genre-derived cover art for the Library bookshelf. These are *book cover*
// colours (vibrant jewel tones, dyed-cloth feel) — deliberately their own
// palette, not the app's aspect-colour category system. Gilt + page-edge are
// constant and live in library.css.

type Cover = { bg: string; text: string }

const GENRE_COVERS: Record<string, Cover> = {
  fantasy:      { bg: 'linear-gradient(160deg,#7c3aed,#5b21b6 55%,#4c1d95)', text: '#f3e8ff' },
  'sci-fi':     { bg: 'linear-gradient(160deg,#0e7490,#155e75 55%,#0c4a5e)', text: '#d6fbff' },
  literary:     { bg: 'linear-gradient(160deg,#414c5c,#2a3340 55%,#1d242e)', text: '#e9eef5' },
  romance:      { bg: 'linear-gradient(160deg,#c41d49,#9f1239 55%,#811335)', text: '#ffe1ea' },
  mystery:      { bg: 'linear-gradient(160deg,#157a3c,#14532d 55%,#0a3a1f)', text: '#dcfce7' },
  historical:   { bg: 'linear-gradient(160deg,#b5650f,#92400e 55%,#723408)', text: '#fdeccb' },
  thriller:     { bg: 'linear-gradient(160deg,#3a4759,#222c39 55%,#10141d)', text: '#e6ebf2' },
  horror:       { bg: 'linear-gradient(160deg,#8a1f1f,#4a0b0b 55%,#250707)', text: '#ffd9d9' },
}

// Vibrant fallback pool for unknown genres — picked deterministically by title.
const COVER_POOL: Cover[] = [
  { bg: 'linear-gradient(160deg,#6d28d9,#4c1d95 55%,#3b1175)', text: '#efe2ff' },
  { bg: 'linear-gradient(160deg,#0d9488,#0f766e 55%,#115e59)', text: '#d2fbf4' },
  { bg: 'linear-gradient(160deg,#b91c4a,#881337 55%,#6b0f2c)', text: '#ffdde7' },
  { bg: 'linear-gradient(160deg,#15803d,#166534 55%,#0c451f)', text: '#d7f7df' },
  { bg: 'linear-gradient(160deg,#c2620e,#9a4a0c 55%,#7a3a08)', text: '#fde9ca' },
  { bg: 'linear-gradient(160deg,#1d4ed8,#1e40af 55%,#172f78)', text: '#dbe6ff' },
  { bg: 'linear-gradient(160deg,#0e7490,#155e75 55%,#0c4a5e)', text: '#d6fbff' },
  { bg: 'linear-gradient(160deg,#9d2463,#7c1d52 55%,#5e1540)', text: '#ffd9ee' },
]

function titleHash(title: string): number {
  let h = 0
  for (let i = 0; i < title.length; i++) h = ((h << 5) - h + title.charCodeAt(i)) | 0
  return Math.abs(h)
}

export function genrePalette(genre: string, title?: string): Cover {
  const key = (genre || '').toLowerCase().replace(/[\s_]+/g, '-')
  if (GENRE_COVERS[key]) return GENRE_COVERS[key]
  if (title) return COVER_POOL[titleHash(title) % COVER_POOL.length]
  return COVER_POOL[0]
}
