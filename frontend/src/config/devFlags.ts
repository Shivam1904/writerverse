// Single flag for every "we're still building" dev convenience that must
// switch itself off at launch with no manual step (e.g. skipping the terms
// checkbox locally, or showing the password-reset link inline instead of only
// emailing it). `import.meta.env.DEV` is false in any built bundle
// (preview/staging/prod), so this flips on its own at launch.
export const DEV_SHORTCUTS_ENABLED = import.meta.env.DEV
