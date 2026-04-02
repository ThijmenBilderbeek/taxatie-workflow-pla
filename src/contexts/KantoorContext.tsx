import { createContext, useContext, useState, useEffect, type ReactNode } from 'react'
import { supabase } from '@/lib/supabaseClient'

interface KantoorContextValue {
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

  useEffect(() => {
    async function fetchKantoor() {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session?.user) {
        setKantoorId(null)
        setKantoorNaam(null)
        setRole(null)
        setLoading(false)
        return
      }

      const { data: membership } = await supabase
        .from('kantoor_members')
        .select('kantoor_id, role, kantoren(naam)')
        .eq('user_id', session.user.id)
        .limit(1)
        .maybeSingle()

      if (membership) {
        setKantoorId(membership.kantoor_id as string)
        setRole(membership.role as 'owner' | 'admin' | 'member')
        const kantoor = membership.kantoren as unknown as { naam: string } | null
        setKantoorNaam(kantoor?.naam ?? null)
      } else {
        setKantoorId(null)
        setKantoorNaam(null)
        setRole(null)
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
