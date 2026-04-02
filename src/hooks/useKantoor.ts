import { useKantoorContext } from '@/contexts/KantoorContext'

/**
 * Returns the active kantoor context for the logged-in user.
 * Provides kantoorId, kantoorNaam, role, and loading state.
 * Used by all hooks that need to read/write kantoor-scoped data.
 */
export function useKantoor() {
  return useKantoorContext()
}
