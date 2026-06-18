import type { SyncArea } from "./loopStore";

// In-memory SyncArea backing for tests. get(null) returns every key (required
// by listEntries/loadEntry). `failSetsAfter` makes set() throw after N
// successful writes, to exercise the local fallback. `data`/`dump` expose the
// store for per-test assertions and wrappers.
export type MemoryArea = SyncArea & {
  data: Map<string, unknown>;
  dump: () => Record<string, unknown>;
};

export function makeMemoryArea(
  initial: Record<string, unknown> = {},
  opts: { failSetsAfter?: number } = {}
): MemoryArea {
  const data = new Map<string, unknown>(Object.entries(initial));
  let sets = 0;
  return {
    data,
    async get(key: string | null) {
      if (key === null) return Object.fromEntries(data);
      return data.has(key) ? { [key]: data.get(key) } : {};
    },
    async set(items: Record<string, unknown>) {
      if (opts.failSetsAfter != null && sets >= opts.failSetsAfter) {
        sets++;
        throw new Error("QUOTA_BYTES quota exceeded");
      }
      sets++;
      for (const [k, v] of Object.entries(items)) data.set(k, v);
    },
    async remove(key: string) {
      data.delete(key);
    },
    dump: () => Object.fromEntries(data)
  };
}
