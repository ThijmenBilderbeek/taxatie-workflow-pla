import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import { supabase } from '@/lib/supabaseClient'

export interface KantoorContextValue {
  kantoorId: string | null
  kantoorNaam: string | null
  role: 'owner' | 'admin' | 'member' | null
  loading: boolean
}

const KantoorContext = createContext<KantoorContextValue>({
  kantoorId: null,
  kantoorNaam: null,
  role: null,
  loading: true,
})

export function KantoorProvider({ children }: { children: ReactNode }) {
  const [kantoorId, setKantoorId] = useState<string | null>(null)
  const [kantoorNaam, setKantoorNaam] = useState<string | null>(null)
  const [role, setRole] = useState<'owner' | 'admin' | 'member' | null>(null)
  const [loading, setLoading] = useState(true)

  async function fetchKantoor() {
    const { data: { session } } = await supabase.auth.getSession()
    if (!session?.user) {
      setKantoorId(null)
      setKantoorNaam(null)
      setRole(null)
      setLoading(false)
      return
    }

    const { data, error } = await supabase
      .from('kantoor_members')
      .select('kantoor_id, role, kantoren(naam)')
      .eq('user_id', session.user.id)
      .limit(1)
      .maybeSingle()

    if (error) {
      console.warn('[KantoorContext] Failed to fetch kantoor membership:', error.message, error)
      setKantoorId(null)
      setKantoorNaam(null)
      setRole(null)
    } else if (data) {
      setKantoorId(data.kantoor_id)
      setRole(data.role as 'owner' | 'admin' | 'member')
      const kantoren = data.kantoren as { naam: string } | { naam: string }[] | null
      const kantoorRecord = Array.isArray(kantoren) ? kantoren[0] : kantoren
      setKantoorNaam(kantoorRecord?.naam ?? null)
    } else {
      setKantoorId(null)
      setKantoorNaam(null)
      setRole(null)
    }

    setLoading(false)
  }

  useEffect(() => {
    void fetchKantoor()

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'SIGNED_IN' || event === 'SIGNED_OUT' || event === 'TOKEN_REFRESHED') {
        void fetchKantoor()
      }
    })

    return () => {
      subscription.unsubscribe()
    }
  }, [])

  return (
    <KantoorContext.Provider value={{ kantoorId, kantoorNaam, role, loading }}>
      {children}
    </KantoorContext.Provider>
  )
}

export function useKantoorContext(): KantoorContextValue {
  return useContext(KantoorContext)
}
