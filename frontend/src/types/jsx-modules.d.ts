declare module '*.jsx' {
  const value: import('react').ComponentType<Record<string, unknown>>
  export default value
}
