import { useState, useEffect, useCallback } from 'react'
import { supabase } from '@/lib/supabaseClient'
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
import { Building2, Users, ArrowLeft, Trash2 } from 'lucide-react'

interface Kantoor {
  id: string
  naam: string
  slug: string
  created_at: string
  member_count: number
}

interface KantoorMember {
  id: string
  user_id: string
  role: string
  created_at: string
  email: string | null
  full_name: string | null
}

function generateSlug(naam: string): string {
  return naam
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
}

function formatDate(dateString: string) {
  return new Date(dateString).toLocaleDateString('nl-NL', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  })
}

function getRolLabel(role: string) {
  switch (role) {
    case 'owner': return 'Eigenaar'
    case 'admin': return 'Beheerder'
    case 'member': return 'Lid'
    default: return role
  }
}

export function AdminPanel() {
  const [kantoren, setKantoren] = useState<Kantoor[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedKantoor, setSelectedKantoor] = useState<Kantoor | null>(null)
  const [members, setMembers] = useState<KantoorMember[]>([])
  const [loadingMembers, setLoadingMembers] = useState(false)

  // Nieuw kantoor formulier
  const [newNaam, setNewNaam] = useState('')
  const [newSlug, setNewSlug] = useState('')
  const [slugManuallyEdited, setSlugManuallyEdited] = useState(false)
  const [creatingKantoor, setCreatingKantoor] = useState(false)

  // Lid toevoegen
  const [addEmail, setAddEmail] = useState('')
  const [addRole, setAddRole] = useState('member')
  const [addingMember, setAddingMember] = useState(false)

  const fetchKantoren = useCallback(async () => {
    setLoading(true)
    const { data, error } = await supabase.rpc('admin_get_all_kantoren')
    if (error) {
      toast.error('Fout bij ophalen kantoren: ' + error.message)
    } else {
      setKantoren((data ?? []) as Kantoor[])
    }
    setLoading(false)
  }, [])

  useEffect(() => {
    fetchKantoren()
  }, [fetchKantoren])

  const fetchMembers = useCallback(async (kantoorId: string) => {
    setLoadingMembers(true)
    const { data, error } = await supabase.rpc('admin_get_kantoor_members', { p_kantoor_id: kantoorId })
    if (error) {
      toast.error('Fout bij ophalen leden: ' + error.message)
    } else {
      setMembers((data ?? []) as KantoorMember[])
    }
    setLoadingMembers(false)
  }, [])

  const handleSelectKantoor = (kantoor: Kantoor) => {
    setSelectedKantoor(kantoor)
    setAddEmail('')
    setAddRole('member')
    fetchMembers(kantoor.id)
  }

  const handleBackToList = () => {
    setSelectedKantoor(null)
    setMembers([])
    fetchKantoren()
  }

  const handleNaamChange = (value: string) => {
    setNewNaam(value)
    if (!slugManuallyEdited) {
      setNewSlug(generateSlug(value))
    }
  }

  const handleSlugChange = (value: string) => {
    setNewSlug(value)
    setSlugManuallyEdited(true)
  }

  const handleCreateKantoor = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!newNaam.trim() || !newSlug.trim()) return

    setCreatingKantoor(true)
    try {
      const { error } = await supabase.rpc('admin_create_kantoor', {
        p_naam: newNaam.trim(),
        p_slug: newSlug.trim(),
      })

      if (error) {
        if (error.code === '23505') {
          toast.error('Deze slug is al in gebruik. Kies een andere slug.')
        } else {
          toast.error('Fout bij aanmaken kantoor: ' + error.message)
        }
      } else {
        toast.success(`Kantoor "${newNaam}" aangemaakt!`)
        setNewNaam('')
        setNewSlug('')
        setSlugManuallyEdited(false)
        fetchKantoren()
      }
    } catch {
      toast.error('Er is een onbekende fout opgetreden')
    } finally {
      setCreatingKantoor(false)
    }
  }

  const handleAddMember = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!addEmail.trim() || !selectedKantoor) return

    setAddingMember(true)
    try {
      const { error } = await supabase.rpc('admin_add_member', {
        p_kantoor_id: selectedKantoor.id,
        p_email: addEmail.trim().toLowerCase(),
        p_role: addRole,
      })

      if (error) {
        toast.error('Fout bij toevoegen lid: ' + error.message)
      } else {
        toast.success(`${addEmail} toegevoegd aan ${selectedKantoor.naam}`)
        setAddEmail('')
        setAddRole('member')
        fetchMembers(selectedKantoor.id)
        setSelectedKantoor((prev) => prev ? { ...prev, member_count: prev.member_count + 1 } : prev)
      }
    } catch {
      toast.error('Er is een onbekende fout opgetreden')
    } finally {
      setAddingMember(false)
    }
  }

  const handleRoleChange = async (memberId: string, newRole: string) => {
    const { error } = await supabase.rpc('admin_update_member_role', {
      p_member_id: memberId,
      p_role: newRole,
    })

    if (error) {
      toast.error('Fout bij wijzigen rol: ' + error.message)
    } else {
      toast.success('Rol bijgewerkt')
      setMembers((prev) => prev.map((m) => (m.id === memberId ? { ...m, role: newRole } : m)))
    }
  }

  const handleRemoveMember = async (memberId: string) => {
    const { error } = await supabase.rpc('admin_remove_member', { p_member_id: memberId })

    if (error) {
      toast.error('Fout bij verwijderen lid: ' + error.message)
    } else {
      toast.success('Lid verwijderd')
      setMembers((prev) => prev.filter((m) => m.id !== memberId))
      setSelectedKantoor((prev) => prev ? { ...prev, member_count: Math.max(0, prev.member_count - 1) } : prev)
    }
  }

  // Kantoor detail view
  if (selectedKantoor) {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-3">
          <Button variant="outline" size="sm" onClick={handleBackToList}>
            <ArrowLeft className="h-4 w-4 mr-2" />
            Terug naar kantoren
          </Button>
          <div>
            <h2 className="text-2xl font-semibold">{selectedKantoor.naam}</h2>
            <p className="text-sm text-muted-foreground">Slug: {selectedKantoor.slug}</p>
          </div>
        </div>

        {/* Lid toevoegen */}
        <Card>
          <CardHeader>
            <CardTitle>Gebruiker toevoegen</CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleAddMember} className="flex gap-2 items-end">
              <div className="flex-1 space-y-1">
                <Label htmlFor="add-email">E-mailadres</Label>
                <Input
                  id="add-email"
                  type="email"
                  placeholder="gebruiker@voorbeeld.nl"
                  value={addEmail}
                  onChange={(e) => setAddEmail(e.target.value)}
                  required
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="add-role">Rol</Label>
                <Select value={addRole} onValueChange={setAddRole}>
                  <SelectTrigger id="add-role" className="w-36">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="member">Lid</SelectItem>
                    <SelectItem value="admin">Beheerder</SelectItem>
                    <SelectItem value="owner">Eigenaar</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <Button type="submit" disabled={addingMember || !addEmail.trim()}>
                {addingMember ? 'Bezig...' : 'Toevoegen'}
              </Button>
            </form>
          </CardContent>
        </Card>

        {/* Leden overzicht */}
        <Card>
          <CardHeader>
            <CardTitle>Leden ({selectedKantoor.member_count})</CardTitle>
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
                      <p className="font-medium truncate">
                        {member.full_name || member.email || member.user_id}
                      </p>
                      {member.full_name && member.email && (
                        <p className="text-sm text-muted-foreground truncate">{member.email}</p>
                      )}
                      <p className="text-xs text-muted-foreground">Lid sinds {formatDate(member.created_at)}</p>
                    </div>
                    <div className="flex items-center gap-2 ml-4">
                      {member.role !== 'owner' ? (
                        <Select
                          value={member.role}
                          onValueChange={(value) => handleRoleChange(member.id, value)}
                        >
                          <SelectTrigger className="w-32">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="owner">Eigenaar</SelectItem>
                            <SelectItem value="admin">Beheerder</SelectItem>
                            <SelectItem value="member">Lid</SelectItem>
                          </SelectContent>
                        </Select>
                      ) : (
                        <span className="text-sm text-muted-foreground px-2">
                          {getRolLabel(member.role)}
                        </span>
                      )}
                      {member.role !== 'owner' && (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="text-destructive hover:text-destructive"
                          onClick={() => handleRemoveMember(member.id)}
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
      </div>
    )
  }

  // Kantoren overzicht
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-semibold">Admin Panel</h2>
        <p className="text-muted-foreground">Beheer kantoren en gebruikers</p>
      </div>

      {/* Nieuw kantoor aanmaken */}
      <Card>
        <CardHeader>
          <CardTitle>Nieuw kantoor aanmaken</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleCreateKantoor} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="kantoor-naam">Kantoornaam</Label>
                <Input
                  id="kantoor-naam"
                  placeholder="bijv. Makelaardij Amsterdam"
                  value={newNaam}
                  onChange={(e) => handleNaamChange(e.target.value)}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="kantoor-slug">Slug</Label>
                <Input
                  id="kantoor-slug"
                  placeholder="bijv. makelaardij-amsterdam"
                  value={newSlug}
                  onChange={(e) => handleSlugChange(e.target.value)}
                  required
                />
              </div>
            </div>
            <Button
              type="submit"
              disabled={creatingKantoor || !newNaam.trim() || !newSlug.trim()}
            >
              {creatingKantoor ? 'Bezig...' : 'Kantoor aanmaken'}
            </Button>
          </form>
        </CardContent>
      </Card>

      {/* Kantoren lijst */}
      <Card>
        <CardHeader>
          <CardTitle>Alle kantoren</CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <p className="text-muted-foreground text-sm">Laden...</p>
          ) : kantoren.length === 0 ? (
            <p className="text-muted-foreground text-sm">Nog geen kantoren aangemaakt</p>
          ) : (
            <div className="space-y-2">
              {kantoren.map((kantoor) => (
                <button
                  key={kantoor.id}
                  className="w-full flex items-center justify-between p-3 rounded-lg border hover:bg-muted/50 transition-colors text-left"
                  onClick={() => handleSelectKantoor(kantoor)}
                >
                  <div className="flex items-center gap-3">
                    <Building2 className="h-5 w-5 text-muted-foreground flex-shrink-0" />
                    <div>
                      <p className="font-medium">{kantoor.naam}</p>
                      <p className="text-sm text-muted-foreground">{kantoor.slug}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-4 text-sm text-muted-foreground">
                    <span className="flex items-center gap-1">
                      <Users className="h-4 w-4" />
                      {kantoor.member_count} {kantoor.member_count === 1 ? 'lid' : 'leden'}
                    </span>
                    <span>{formatDate(kantoor.created_at)}</span>
                  </div>
                </button>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
