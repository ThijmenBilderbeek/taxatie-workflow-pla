import { useKantoorContext } from '@/contexts/KantoorContext'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from './ui/dropdown-menu'
import { Button } from './ui/button'
import { ChevronDown, Building2, Check } from 'lucide-react'

export function KantoorSwitcher() {
  const { kantoorId, kantoorNaam, allMemberships, switchKantoor } = useKantoorContext()

  // Alleen zichtbaar als de user meerdere kantoor memberships heeft
  if (!kantoorNaam || allMemberships.length <= 1) {
    return (
      <span className="text-sm font-medium text-muted-foreground hidden sm:block">
        {kantoorNaam}
      </span>
    )
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm" className="gap-2">
          <Building2 className="h-4 w-4" />
          <span className="max-w-32 truncate">{kantoorNaam}</span>
          <ChevronDown className="h-3 w-3 text-muted-foreground" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuLabel>Kantoor wisselen</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {allMemberships.map((membership) => (
          <DropdownMenuItem
            key={membership.kantoorId}
            onClick={() => switchKantoor(membership.kantoorId)}
            className="flex items-center justify-between"
          >
            <div className="flex items-center gap-2">
              <Building2 className="h-4 w-4 text-muted-foreground" />
              <span className="truncate">{membership.kantoorNaam}</span>
            </div>
            {membership.kantoorId === kantoorId && (
              <Check className="h-4 w-4 text-primary" />
            )}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
