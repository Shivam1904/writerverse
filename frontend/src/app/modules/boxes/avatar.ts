// Shared avatar look for a person — used by the People box and to visually
// "attach" a character-scoped rule to the right person (same colour + initial).
// Loose / any.
const AVATARS = [
  'linear-gradient(135deg,#cc7a3a,#a8541d)',
  'linear-gradient(135deg,#3f7e9a,#2b5870)',
  'linear-gradient(135deg,#7d6aa6,#564a78)',
  'linear-gradient(135deg,#5f8a6b,#3f6b53)',
  'linear-gradient(135deg,#a99680,#82715b)',
  'linear-gradient(135deg,#b06a6a,#854848)',
];

export function avatarColor(name) {
  let h = 0;
  for (const ch of name || '') h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return AVATARS[h % AVATARS.length];
}

// Solid mid-tone per name — same families/order as AVATARS, but a single hex
// so it can tint an SVG fill (the gradient strings above can't). Used by <Avatar>.
const AVATAR_TINTS = ['#c27636', '#3c7991', '#74609f', '#588566', '#a08c73', '#a9605f'];

export function avatarTint(name) {
  let h = 0;
  for (const ch of name || '') h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return AVATAR_TINTS[h % AVATAR_TINTS.length];
}

export function initial(name) {
  return (name || '?').charAt(0).toUpperCase();
}
