// app theme templates.
// Each theme sets the color tokens; static tokens (radius, shadow, type) live in app.css.

export const THEME_TOKENS = [
  '--canvas', '--paper', '--paper-2', '--surface', '--surface-2', '--surface-3',
  '--ai-bg', '--ai-bg-2',
  '--ink', '--ink-2', '--ink-3', '--ink-4',
  '--line', '--line-2', '--line-3',
  '--terra', '--terra-deep', '--terra-soft',
  '--sage', '--teal', '--teal-soft', '--mauve',
  '--clay', '--clay-soft', '--gold', '--gold-soft',
] as const;

export type ThemeToken = (typeof THEME_TOKENS)[number];
export type ThemeVars = Record<ThemeToken, string>;

export const THEMES: Record<string, ThemeVars> = {
  // Steel · brushed silver-graphite (metallic)
  steel: {
    '--canvas': '#c4c9d0', '--paper': '#dee2e8', '--paper-2': '#d0d5dd',
    '--surface': '#f9fafc', '--surface-2': '#e2e6ec', '--surface-3': '#d4d9e1',
    '--ai-bg': '#e6eaf0', '--ai-bg-2': '#d3d9e1',
    '--ink': '#191d23', '--ink-2': '#48505b', '--ink-3': '#7c8692', '--ink-4': '#a7b0bb',
    '--line': '#d3d9e0', '--line-2': '#bbc3cd', '--line-3': '#a3acb8',
    '--terra': '#3a6ea5', '--terra-deep': '#27517f', '--terra-soft': '#d4e1f0',
    '--sage': '#4a6b66', '--teal': '#2c7a78', '--teal-soft': '#cfe2e0', '--mauve': '#5b5570',
    '--clay': '#a6553f', '--clay-soft': '#efd6cd', '--gold': '#8a7320', '--gold-soft': '#e8dca0',
  },
  // Graphite · dark metallic
  graphite: {
    '--canvas': '#181b20', '--paper': '#23272e', '--paper-2': '#1d2128',
    '--surface': '#2b3038', '--surface-2': '#242931', '--surface-3': '#1e222a',
    '--ai-bg': '#272c34', '--ai-bg-2': '#20242c',
    '--ink': '#eef1f5', '--ink-2': '#b6bec8', '--ink-3': '#838d99', '--ink-4': '#5c6571',
    '--line': '#343a43', '--line-2': '#404751', '--line-3': '#4c545f',
    '--terra': '#5b9bd5', '--terra-deep': '#83b4e2', '--terra-soft': '#2a3a4c',
    '--sage': '#74a094', '--teal': '#4fae9f', '--teal-soft': '#243f39', '--mauve': '#9a8fb5',
    '--clay': '#d28b73', '--clay-soft': '#3d2a22', '--gold': '#d4b85a', '--gold-soft': '#3a3320',
  },
  // Brass · warm metallic
  brass: {
    '--canvas': '#c7bb9f', '--paper': '#e0d6bf', '--paper-2': '#d5c9b0',
    '--surface': '#f9f7f1', '--surface-2': '#e5dcc6', '--surface-3': '#d8ceb4',
    '--ai-bg': '#e8dfc8', '--ai-bg-2': '#dccfb2',
    '--ink': '#2a2418', '--ink-2': '#5c5340', '--ink-3': '#8d8268', '--ink-4': '#b3a988',
    '--line': '#dccfb2', '--line-2': '#cabd9c', '--line-3': '#b8a983',
    '--terra': '#9c6b1f', '--terra-deep': '#7a4f10', '--terra-soft': '#ecdcb8',
    '--sage': '#5f6b48', '--teal': '#3f6e63', '--teal-soft': '#d6e2d2', '--mauve': '#6e5a52',
    '--clay': '#a85a30', '--clay-soft': '#f0d8c4', '--gold': '#93701a', '--gold-soft': '#ead9a0',
  },
  // Mist · cool blue-grey
  mist: {
    '--canvas': '#cfd8e6', '--paper': '#e1e7ef', '--paper-2': '#d7dde7',
    '--surface': '#fbfcfd', '--surface-2': '#e8ecf3', '--surface-3': '#dde3eb',
    '--ai-bg': '#e0e6f0', '--ai-bg-2': '#ced7e3',
    '--ink': '#1d242e', '--ink-2': '#525c6a', '--ink-3': '#8590a0', '--ink-4': '#aeb6c1',
    '--line': '#dae0e8', '--line-2': '#c5ccd7', '--line-3': '#b1bac7',
    '--terra': '#3a6dbe', '--terra-deep': '#1f4d99', '--terra-soft': '#d6e2f3',
    '--sage': '#4d706e', '--teal': '#2d7575', '--teal-soft': '#cee0df', '--mauve': '#5c5476',
    '--clay': '#b85643', '--clay-soft': '#f0d4cb', '--gold': '#7e6928', '--gold-soft': '#e6de9e',
  },
  // Sage · eucalyptus green · natural
  sage: {
    '--canvas': '#d4dcca', '--paper': '#e3e9d6', '--paper-2': '#d9e0c8',
    '--surface': '#fafbf7', '--surface-2': '#e6ebd6', '--surface-3': '#d9dfc6',
    '--ai-bg': '#e3e8d2', '--ai-bg-2': '#cfd7b9',
    '--ink': '#1e221c', '--ink-2': '#545b4d', '--ink-3': '#8a917f', '--ink-4': '#aeb59e',
    '--line': '#d4dac4', '--line-2': '#c1c8ae', '--line-3': '#aab296',
    '--terra': '#a85a32', '--terra-deep': '#7c3d13', '--terra-soft': '#efd7c4',
    '--sage': '#4a6a47', '--teal': '#2f6e58', '--teal-soft': '#d2dfd4', '--mauve': '#6e5566',
    '--clay': '#b25239', '--clay-soft': '#f0d3c6', '--gold': '#766924', '--gold-soft': '#e3df9d',
  },
  // Lilac · soft purple · dusky
  lilac: {
    '--canvas': '#d6cfde', '--paper': '#e6dfeb', '--paper-2': '#ddd5e3',
    '--surface': '#fbfafc', '--surface-2': '#ebe3f0', '--surface-3': '#ddd5e4',
    '--ai-bg': '#e4dbed', '--ai-bg-2': '#cdc2d8',
    '--ink': '#211c26', '--ink-2': '#595167', '--ink-3': '#8d839a', '--ink-4': '#b0a8ba',
    '--line': '#d6cee0', '--line-2': '#c1b5ce', '--line-3': '#ac9ebb',
    '--terra': '#785599', '--terra-deep': '#4f3074', '--terra-soft': '#e0d2ed',
    '--sage': '#4a6a4f', '--teal': '#4c6e75', '--teal-soft': '#d4dee2', '--mauve': '#6f4a6e',
    '--clay': '#a85549', '--clay-soft': '#efd2cc', '--gold': '#7c6630', '--gold-soft': '#e6da9b',
  },
  // Paper · the original warm beige
  paper: {
    '--canvas': '#e9e0cc', '--paper': '#f3ecdc', '--paper-2': '#ede5d2',
    '--surface': '#fefcf8', '--surface-2': '#f4eedf', '--surface-3': '#ede6d4',
    '--ai-bg': '#f0e7d1', '--ai-bg-2': '#ebe0c4',
    '--ink': '#2b2419', '--ink-2': '#6a5e4d', '--ink-3': '#9d917e', '--ink-4': '#bcb19b',
    '--line': '#e3dac3', '--line-2': '#d5cbb1', '--line-3': '#c6bb9d',
    '--terra': '#b35a1c', '--terra-deep': '#8e3f00', '--terra-soft': '#f5dec4',
    '--sage': '#4d6a5b', '--teal': '#306e69', '--teal-soft': '#dceae8', '--mauve': '#6e4f5e',
    '--clay': '#a64628', '--clay-soft': '#f5d9cc', '--gold': '#8a6700', '--gold-soft': '#f0e3b8',
  },
  // Ink · stark editorial monochrome · near black-on-white, one electric accent
  ink: {
    '--canvas': '#e6e6e8', '--paper': '#f2f2f3', '--paper-2': '#eaeaec',
    '--surface': '#ffffff', '--surface-2': '#f5f5f6', '--surface-3': '#ebebed',
    '--ai-bg': '#f0f0f2', '--ai-bg-2': '#e4e4e7',
    '--ink': '#0a0a0b', '--ink-2': '#3a3a3e', '--ink-3': '#76767c', '--ink-4': '#a8a8af',
    '--line': '#e0e0e3', '--line-2': '#cbcbd0', '--line-3': '#b3b3ba',
    '--terra': '#1f4fff', '--terra-deep': '#1438cc', '--terra-soft': '#dbe2ff',
    '--sage': '#1f6f5c', '--teal': '#0e7c7b', '--teal-soft': '#d4eceb', '--mauve': '#5b4b8a',
    '--clay': '#c23b22', '--clay-soft': '#f7d8d0', '--gold': '#9a7a00', '--gold-soft': '#efe3a8',
  },
  // Noir · stark OLED dark · high-contrast white on black, vivid accents
  noir: {
    '--canvas': '#050506', '--paper': '#121214', '--paper-2': '#0c0c0e',
    '--surface': '#18181b', '--surface-2': '#131316', '--surface-3': '#0e0e10',
    '--ai-bg': '#161619', '--ai-bg-2': '#101012',
    '--ink': '#fafafa', '--ink-2': '#c4c4c8', '--ink-3': '#86868c', '--ink-4': '#5a5a60',
    '--line': '#262629', '--line-2': '#323236', '--line-3': '#3f3f44',
    '--terra': '#4d8dff', '--terra-deep': '#7aa9ff', '--terra-soft': '#142033',
    '--sage': '#5fae8f', '--teal': '#2dd4bf', '--teal-soft': '#0e2b27', '--mauve': '#b08ee8',
    '--clay': '#ff6f5e', '--clay-soft': '#3a1c18', '--gold': '#e8c252', '--gold-soft': '#332b12',
  },
  // Blush · soft pastel rose · light and warm
  blush: {
    '--canvas': '#f0dde0', '--paper': '#faeaec', '--paper-2': '#f5e2e4',
    '--surface': '#fefbfc', '--surface-2': '#f8eaec', '--surface-3': '#f2e0e3',
    '--ai-bg': '#f9e7ea', '--ai-bg-2': '#f3dade',
    '--ink': '#2c2125', '--ink-2': '#6a565c', '--ink-3': '#9d878d', '--ink-4': '#c2adb2',
    '--line': '#efdde0', '--line-2': '#e3cace', '--line-3': '#d6b8bd',
    '--terra': '#c25a72', '--terra-deep': '#9c3a52', '--terra-soft': '#f6dbe1',
    '--sage': '#6a8a72', '--teal': '#4f8a86', '--teal-soft': '#dcebe9', '--mauve': '#8a5f86',
    '--clay': '#c65f4a', '--clay-soft': '#f6dcd3', '--gold': '#a8842f', '--gold-soft': '#f0e2b0',
  },
  // Cotton · pastel sky blue · light and airy
  cotton: {
    '--canvas': '#d8e4ef', '--paper': '#e9f1f8', '--paper-2': '#dfe9f3',
    '--surface': '#fcfdfe', '--surface-2': '#e9f1f8', '--surface-3': '#dde8f2',
    '--ai-bg': '#e4eef7', '--ai-bg-2': '#d3e1ee',
    '--ink': '#1b2530', '--ink-2': '#4e5d6c', '--ink-3': '#82909f', '--ink-4': '#aab6c3',
    '--line': '#dbe6f0', '--line-2': '#c6d5e3', '--line-3': '#b0c3d5',
    '--terra': '#3f7fc4', '--terra-deep': '#245a99', '--terra-soft': '#d8e8f7',
    '--sage': '#4f8278', '--teal': '#2f8694', '--teal-soft': '#d4ebef', '--mauve': '#6a6aa0',
    '--clay': '#c2674a', '--clay-soft': '#f3ddd2', '--gold': '#99812f', '--gold-soft': '#ece2ab',
  },
  // Mint · pastel sea-green · light and fresh
  mint: {
    '--canvas': '#d4e8df', '--paper': '#e6f2eb', '--paper-2': '#dcebe3',
    '--surface': '#fbfdfc', '--surface-2': '#e7f2ec', '--surface-3': '#d9e9e0',
    '--ai-bg': '#e2f0e9', '--ai-bg-2': '#cfe5da',
    '--ink': '#182420', '--ink-2': '#4c5d56', '--ink-3': '#7f928b', '--ink-4': '#a8bab2',
    '--line': '#d8e8e0', '--line-2': '#c2d8ce', '--line-3': '#abc7bb',
    '--terra': '#2f8f7a', '--terra-deep': '#1c6b5a', '--terra-soft': '#d2ece4',
    '--sage': '#4f8a5f', '--teal': '#2f9c84', '--teal-soft': '#d2ece4', '--mauve': '#5f6aa0',
    '--clay': '#c2674a', '--clay-soft': '#f3ddd2', '--gold': '#91842f', '--gold-soft': '#ece2ab',
  },
  // Cream · warm ivory butter · light and soft
  cream: {
    '--canvas': '#ece3cf', '--paper': '#f7f0dd', '--paper-2': '#f1e9d3',
    '--surface': '#fefdfa', '--surface-2': '#f7f1e2', '--surface-3': '#f0e8d6',
    '--ai-bg': '#f5edd8', '--ai-bg-2': '#efe5cb',
    '--ink': '#2e2a1d', '--ink-2': '#645c46', '--ink-3': '#968c70', '--ink-4': '#bcb295',
    '--line': '#ebe1c8', '--line-2': '#dcd0b2', '--line-3': '#cbbe9b',
    '--terra': '#c08a2c', '--terra-deep': '#95661a', '--terra-soft': '#f3e6c2',
    '--sage': '#6b7a4a', '--teal': '#3f7e6a', '--teal-soft': '#d9ece2', '--mauve': '#7a6056',
    '--clay': '#bb5a35', '--clay-soft': '#f3dcc9', '--gold': '#8f7320', '--gold-soft': '#efe2a4',
  },
  // Cobalt · solid saturated blue · bold on cool grey
  cobalt: {
    '--canvas': '#c9d2e0', '--paper': '#dde4ee', '--paper-2': '#d2dae7',
    '--surface': '#f9fafd', '--surface-2': '#e1e7f1', '--surface-3': '#d3dbe8',
    '--ai-bg': '#dde6f3', '--ai-bg-2': '#c8d4e8',
    '--ink': '#131a26', '--ink-2': '#445064', '--ink-3': '#788496', '--ink-4': '#a4afc0',
    '--line': '#d4dce8', '--line-2': '#bdc8d9', '--line-3': '#a6b4ca',
    '--terra': '#2b4ad6', '--terra-deep': '#1a32a8', '--terra-soft': '#d3dcf7',
    '--sage': '#3f7560', '--teal': '#18738f', '--teal-soft': '#cfe4ea', '--mauve': '#6a4fb0',
    '--clay': '#c44a3a', '--clay-soft': '#f2d6cf', '--gold': '#9a7a1a', '--gold-soft': '#ecdfa0',
  },
  // Material · flat material-design light · white elevations, indigo primary
  material: {
    '--canvas': '#e3e3e6', '--paper': '#f1f1f4', '--paper-2': '#e9e9ed',
    '--surface': '#ffffff', '--surface-2': '#f5f5f7', '--surface-3': '#ededf0',
    '--ai-bg': '#eef0fa', '--ai-bg-2': '#e0e4f6',
    '--ink': '#1c1b1f', '--ink-2': '#44464e', '--ink-3': '#74767e', '--ink-4': '#a3a5ad',
    '--line': '#e2e2e7', '--line-2': '#ccccd3', '--line-3': '#b4b4bd',
    '--terra': '#3f51b5', '--terra-deep': '#2c3a8c', '--terra-soft': '#dde1f5',
    '--sage': '#4a7c4e', '--teal': '#00897b', '--teal-soft': '#cce8e4', '--mauve': '#7b3f9e',
    '--clay': '#d23a30', '--clay-soft': '#f7d8d5', '--gold': '#a87d12', '--gold-soft': '#f3e4b0',
  },
  // Forest · deep dark green · rich natural contrast
  forest: {
    '--canvas': '#0e1611', '--paper': '#16211a', '--paper-2': '#101a14',
    '--surface': '#1c2a22', '--surface-2': '#16221b', '--surface-3': '#111a15',
    '--ai-bg': '#19271f', '--ai-bg-2': '#121e17',
    '--ink': '#eef3ec', '--ink-2': '#b3c4b6', '--ink-3': '#7e9183', '--ink-4': '#56685b',
    '--line': '#243429', '--line-2': '#2f4234', '--line-3': '#3b5141',
    '--terra': '#d99b5a', '--terra-deep': '#e8b67e', '--terra-soft': '#33291a',
    '--sage': '#7fb38a', '--teal': '#4fc0a0', '--teal-soft': '#14302a', '--mauve': '#b394d4',
    '--clay': '#e07d63', '--clay-soft': '#38211b', '--gold': '#d9c25e', '--gold-soft': '#2f2c14',
  },
  // Matte · flat chalky gouache · warm off-white, muted orange + dusty green
  matte: {
    '--canvas': '#e8e6df', '--paper': '#f1efe8', '--paper-2': '#eae8e0',
    '--surface': '#fdfdfb', '--surface-2': '#f1efe7', '--surface-3': '#e9e6dd',
    '--ai-bg': '#f0ede4', '--ai-bg-2': '#e6e2d6',
    '--ink': '#2a2823', '--ink-2': '#5a564c', '--ink-3': '#8a8579', '--ink-4': '#b3ada0',
    '--line': '#e2dfd4', '--line-2': '#d0ccbe', '--line-3': '#bdb8a8',
    '--terra': '#c2622f', '--terra-deep': '#9c4a1e', '--terra-soft': '#f0dcc8',
    '--sage': '#5e7a4e', '--teal': '#3f7a5f', '--teal-soft': '#d7e4d6', '--mauve': '#74607a',
    '--clay': '#b5503a', '--clay-soft': '#f0d7ce', '--gold': '#9c8226', '--gold-soft': '#ece0b0',
  },
};

export const THEME_NAMES = Object.keys(THEMES);
// Default theme — lilac (soft purple, dusky).
export const DEFAULT_THEME = 'lilac';

// Human labels for the picker.
export const THEME_LABELS: Record<string, string> = {
  steel: 'Steel', graphite: 'Graphite', brass: 'Brass',
  mist: 'Mist', sage: 'Sage', lilac: 'Lilac', paper: 'Paper',
  ink: 'Ink', noir: 'Noir', blush: 'Blush', cotton: 'Cotton',
  mint: 'Mint', cream: 'Cream', cobalt: 'Cobalt', material: 'Material',
  forest: 'Forest', matte: 'Matte',
};

// Token groups for the tweak panel layout.
export const TOKEN_GROUPS: { label: string; tokens: ThemeToken[] }[] = [
  { label: 'Paper & surfaces', tokens: ['--canvas', '--paper', '--paper-2', '--surface', '--surface-2', '--surface-3', '--ai-bg', '--ai-bg-2'] },
  { label: 'Ink', tokens: ['--ink', '--ink-2', '--ink-3', '--ink-4'] },
  { label: 'Lines', tokens: ['--line', '--line-2', '--line-3'] },
  { label: 'Accents', tokens: ['--terra', '--terra-deep', '--terra-soft', '--sage', '--teal', '--teal-soft', '--mauve', '--clay', '--clay-soft', '--gold', '--gold-soft'] },
];
