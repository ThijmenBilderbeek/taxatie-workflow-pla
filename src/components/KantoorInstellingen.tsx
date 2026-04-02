import { useState, useEffect, useCallback } from 'react'
import { supabase } from '@/lib/supabaseClient'
import { useKantoorContext } from '@/contexts/KantoorContext'
import { Card, CardContent, CardHeader, CardTitle } from './ui/card'
import { Button } from './ui/button'
import { Input } from './ui/input'
import { Label } from './ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from './ui/select'
import { toast } from 'sonner'
import { Trash2, X } from 'lucide-react'

interface KantoorMember {
  id: string
  user_id: string
  role: 'owner' | 'admin' | 'member'
  created_at: string
  profiles: {
    email: string | null
    full_name: string | null
  } | null
}

interface KantoorInvite {
  id: string
  email: string
  invited_by: string | null
  created_at: string
  accepted_at: string | null
}

export function KantoorInstellingen() {
  const { kantoorId, role: myRole } = useKantoorContext()
  const [members, setMembers] = useState<KantoorMember[]>([])
  const [invites, setInvites] = useState<KantoorInvite[]>([])
  const [loadingMembers, setLoadingMembers] = useState(true)
  const [loadingInvites, setLoadingInvites] = useState(true)
  const [inviteEmail, setInviteEmail] = useState('')
  const [inviteLoading, setInviteLoading] = useState(false)
  const [myUserId, setMyUserId] = useState<string | null>(null)

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setMyUserId(session?.user?.id ?? null)
    })
  }, [])

  const fetchMembers = useCallback(async () => {
    if (!kantoorId) return
    setLoadingMembers(true)
    const { data, error } = await supabase
      .from('kantoor_members')
      .select('id, user_id, role, created_at, profiles(email, full_name)')
      .eq('kantoor_id', kantoorId)
      .order('created_at', { ascending: true })

    if (error) {
      toast.error('Fout bij ophalen leden: ' + error.message)
    } else {
      setMembers((data ?? []) as unknown as KantoorMember[])
    }
    setLoadingMembers(false)
  }, [kantoorId])

  const fetchInvites = useCallback(async () => {
    if (!kantoorId) return
    setLoadingInvites(true)
    const { data, error } = await supabase
      .from('kantoor_invites')
      .select('id, email, invited_by, created_at, accepted_at')
      .eq('kantoor_id', kantoorId)
      .is('accepted_at', null)
      .order('created_at', { ascending: false })

    if (error) {
      toast.error('Fout bij ophalen uitnodigingen: ' + error.message)
    } else {
      setInvites(data ?? [])
    }
    setLoadingInvites(false)
  }, [kantoorId])

  useEffect(() => {
    fetchMembers()
    fetchInvites()
  }, [fetchMembers, fetchInvites])

  const handleInvite = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!inviteEmail.trim() || !kantoorId) return

    setInviteLoading(true)
    try {
      const { data: { session } } = await supabase.auth.getSession()

      const { error } = await supabase
        .from('kantoor_invites')
        .insert({
          kantoor_id: kantoorId,
          email: inviteEmail.trim().toLowerCase(),
          invited_by: session?.user?.id ?? null,
        })

      if (error) {
        toast.error('Fout bij uitnodigen: ' + error.message)
      } else {
        toast.success(`Uitnodiging verzonden naar ${inviteEmail}`)
        setInviteEmail('')
        fetchInvites()
      }
    } catch {
      toast.error('Er is een onbekende fout opgetreden')
    } finally {
      setInviteLoading(false)
    }
  }

  const handleCancelInvite = async (inviteId: string, email: string) => {
    const { error } = await supabase
      .from('kantoor_invites')
      .delete()
      .eq('id', inviteId)

    if (error) {
      toast.error('Fout bij annuleren uitnodiging: ' + error.message)
    } else {
      toast.success(`Uitnodiging voor ${email} geannuleerd`)
      setInvites((prev) => prev.filter((i) => i.id !== inviteId))
    }
  }

  const handleRoleChange = async (memberId: string, newRole: 'admin' | 'member') => {
    const { error } = await supabase
      .from('kantoor_members')
      .update({ role: newRole })
      .eq('id', memberId)

    if (error) {
      toast.error('Fout bij wijzigen rol: ' + error.message)
    } else {
      toast.success('Rol bijgewerkt')
      setMembers((prev) =>
        prev.map((m) => (m.id === memberId ? { ...m, role: newRole } : m))
      )
    }
  }

  const handleRemoveMember = async (memberId: string, userId: string) => {
    if (userId === myUserId) {
      toast.error('Je kunt jezelf niet verwijderen')
      return
    }

    const member = members.find((m) => m.id === memberId)
    if (member?.role === 'owner') {
      toast.error('Je kunt de eigenaar niet verwijderen')
      return
    }

    const { error } = await supabase
      .from('kantoor_members')
      .delete()
      .eq('id', memberId)

    if (error) {
      toast.error('Fout bij verwijderen lid: ' + error.message)
    } else {
      toast.success('Lid verwijderd')
      setMembers((prev) => prev.filter((m) => m.id !== memberId))
    }
  }

  const canManageMembers = myRole === 'owner' || myRole === 'admin'
  const isOwner = myRole === 'owner'

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('nl-NL', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    })
  }

  const getMemberDisplayName = (member: KantoorMember) => {
    return member.profiles?.full_name || member.profiles?.email || member.user_id
  }

  const getRolLabel = (role: string) => {
    switch (role) {
      case 'owner': return 'Eigenaar'
      case 'admin': return 'Beheerder'
      case 'member': return 'Lid'
      default: return role
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-semibold">Kantoor</h2>
        <p className="text-muted-foreground">Beheer je kantoor, leden en uitnodigingen</p>
      </div>

      {/* Leden overzicht */}
      <Card>
        <CardHeader>
          <CardTitle>Leden</CardTitle>
        </CardHeader>
        <CardContent>
          {loadingMembers ? (
            <p className="text-muted-foreground text-sm">Laden...</p>
          ) : members.length === 0 ? (
            <p className="text-muted-foreground text-sm">Geen leden gevonden</p>
          ) : (
            <div className="space-y-2">
              {members.map((member) => (
                <div
                  key={member.id}
                  className="flex items-center justify-between p-3 rounded-lg border"
                >
                  <div className="flex-1 min-w-0">
                    <p className="font-medium truncate">{getMemberDisplayName(member)}</p>
                    {member.profiles?.full_name && member.profiles?.email && (
                      <p className="text-sm text-muted-foreground truncate">{member.profiles.email}</p>
                    )}
                    <p className="text-xs text-muted-foreground">Lid sinds {formatDate(member.created_at)}</p>
                  </div>
                  <div className="flex items-center gap-2 ml-4">
                    {isOwner && member.role !== 'owner' ? (
                      <Select
                        value={member.role}
                        onValueChange={(value) =>
                          handleRoleChange(member.id, value as 'admin' | 'member')
                        }
                      >
                        <SelectTrigger className="w-32">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="admin">Beheerder</SelectItem>
                          <SelectItem value="member">Lid</SelectItem>
                        </SelectContent>
                      </Select>
                    ) : (
                      <span className="text-sm text-muted-foreground px-2">
                        {getRolLabel(member.role)}
                      </span>
                    )}
                    {isOwner && member.role !== 'owner' && member.user_id !== myUserId && (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-destructive hover:text-destructive"
                        onClick={() => handleRemoveMember(member.id, member.user_id)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Uitnodigingen */}
      {canManageMembers && (
        <Card>
          <CardHeader>
            <CardTitle>Uitnodigen</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <form onSubmit={handleInvite} className="flex gap-2">
              <div className="flex-1 space-y-1">
                <Label htmlFor="invite-email" className="sr-only">E-mailadres</Label>
                <Input
                  id="invite-email"
                  type="email"
                  placeholder="E-mailadres collega"
                  value={inviteEmail}
                  onChange={(e) => setInviteEmail(e.target.value)}
                  required
                />
              </div>
              <Button type="submit" disabled={inviteLoading || !inviteEmail.trim()}>
                {inviteLoading ? 'Bezig...' : 'Uitnodigen'}
              </Button>
            </form>

            {/* Openstaande uitnodigingen */}
            {loadingInvites ? (
              <p className="text-muted-foreground text-sm">Laden...</p>
            ) : invites.length > 0 ? (
              <div className="space-y-2">
                <p className="text-sm font-medium text-muted-foreground">Openstaande uitnodigingen</p>
                {invites.map((invite) => (
                  <div
                    key={invite.id}
                    className="flex items-center justify-between p-3 rounded-lg border bg-muted/30"
                  >
                    <div>
                      <p className="text-sm font-medium">{invite.email}</p>
                      <p className="text-xs text-muted-foreground">
                        Uitgenodigd op {formatDate(invite.created_at)}
                      </p>
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-muted-foreground hover:text-destructive"
                      onClick={() => handleCancelInvite(invite.id, invite.email)}
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                ))}
              </div>
            ) : null}
          </CardContent>
        </Card>
      )}
    </div>
  )
}
