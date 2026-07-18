// A collision-resistant id, from the platform's crypto.randomUUID when it exists and
// a timestamp+random fallback when it doesn't (older/embedded runtimes). Shared by the
// marker and group factories so both mint ids the same way.
export function newId(): string {
  const uuid = globalThis.crypto?.randomUUID?.()
  if (uuid) {
    return uuid
  }

  return `m-${Date.now().toString(36)}-${Math.floor(Math.random() * 1e9).toString(36)}`
}
