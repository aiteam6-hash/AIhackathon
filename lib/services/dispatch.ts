import { getState } from "@/lib/store/store";

/** Demo accounts (sample data in the browser) have a session in the local store; real accounts do not. */
export const isDemo = () => !!getState().session;

/**
 * Picks an implementation per call: demo sessions use the in-browser mock, real sessions use Supabase.
 * Functions missing from `real` fall back to the mock until they are converted.
 */
export function dual<T extends object>(mock: T, real: Partial<T>): T {
  return new Proxy(mock, {
    get(target, prop, receiver) {
      if (!isDemo() && prop in real) return Reflect.get(real, prop, receiver);
      return Reflect.get(target, prop, receiver);
    },
  });
}
