/**
 * Widens a deliberately partial test double to the interface it stands in for.
 *
 * A double implements only what the code under test reaches for; this states
 * that in one place per fake instead of letting `any` spread the uncertainty
 * through every call site.
 */
export function fake<T>(value: unknown): T {
  return value as T;
}
