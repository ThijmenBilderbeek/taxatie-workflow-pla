import { createContext, useContext, useState, useEffect, useCallback, useRef, type ReactNode } from 'react'
import { supabase } from '@/lib/supabaseClient'

export interface KantoorMembership {
  kantoorId: string
  kantoorNaam: string
  role: 'owner' | 'admin' | 'member'
}

interface KantoorContextValue {
  kantoorId: string | null
  kantoorNaam: string | null
  role: 'owner' | 'admin' | 'member' | null
  loading: boolean
  allMemberships: KantoorMembership[]
  switchKantoor: (kantoorId: string) => void
  refresh: () => void
}

const KantoorContext = createContext<KantoorContextValue>({
  kantoorId: null,
  kantoorNaam: null,
  role: null,
  loading: true,
  allMemberships: [],
  switchKantoor: () => {},
  refresh: () => {},
})

export function KantoorProvider({ children }: { children: ReactNode }) {
  const [kantoorId, setKantoorId] = useState<string | null>(null)
  const [kantoorNaam, setKantoorNaam] = useState<string | null>(null)
  const [role, setRole] = useState<'owner' | 'admin' | 'member' | null>(null)
  const [loading, setLoading] = useState(true)
  const [allMemberships, setAllMemberships] = useState<KantoorMembership[]>([])
  const [refreshCounter, setRefreshCounter] = useState(0)
  const kantoorIdRef = useRef<string | null>(null)

  const refresh = useCallback(() => {
    setRefreshCounter((c) => c + 1)
  }, [])

  useEffect(() => {
    async function fetchKantoor() {
      setLoading(true)
      const { data: { session } } = await supabase.auth.getSession()
      if (!session?.user) {
        setKantoorId(null)
        setKantoorNaam(null)
        setRole(null)
        setAllMemberships([])
        setLoading(false)
        return
      }

      const { data: memberships } = await supabase
        .from('kantoor_members')
        .select('kantoor_id, role, kantoren(naam)')
        .eq('user_id', session.user.id)

      if (memberships && memberships.length > 0) {
        const parsed: KantoorMembership[] = memberships.map((m) => {
          const kantoor = m.kantoren as unknown as { naam: string } | null
          return {
            kantoorId: m.kantoor_id as string,
            kantoorNaam: kantoor?.naam ?? '',
            role: m.role as 'owner' | 'admin' | 'member',
          }
        })
        setAllMemberships(parsed)

        // Keep current selection if still valid, otherwise pick first
        const prevId = kantoorIdRef.current
        const selected = (prevId && parsed.some((m) => m.kantoorId === prevId))
          ? prevId
          : parsed[0].kantoorId
        const selectedMembership = parsed.find((m) => m.kantoorId === selected) ?? parsed[0]
        kantoorIdRef.current = selectedMembership.kantoorId
        setKantoorId(selectedMembership.kantoorId)
        setRole(selectedMembership.role)
        setKantoorNaam(selectedMembership.kantoorNaam)
      } else {
        setKantoorId(null)
        setKantoorNaam(null)
        setRole(null)
        setAllMemberships([])
      }

      setLoading(false)
    }

    fetchKantoor()

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'SIGNED_IN' || event === 'SIGNED_OUT') {
        fetchKantoor()
      }
    })

    return () => {
      subscription.unsubscribe()
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refreshCounter])

  const switchKantoor = useCallback((newKantoorId: string) => {
    const membership = allMemberships.find((m) => m.kantoorId === newKantoorId)
    if (membership) {
      kantoorIdRef.current = membership.kantoorId
      setKantoorId(membership.kantoorId)
      setKantoorNaam(membership.kantoorNaam)
      setRole(membership.role)
    }
  }, [allMemberships])

  return (
    <KantoorContext.Provider value={{ kantoorId, kantoorNaam, role, loading, allMemberships, switchKantoor, refresh }}>
      {children}
    </KantoorContext.Provider>
  )
}

export function useKantoorContext(): KantoorContextValue {
  return useContext(KantoorContext)
}
