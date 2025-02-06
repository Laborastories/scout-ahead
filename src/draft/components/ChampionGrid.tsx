import { useState, useEffect } from 'react'
import { Input } from '../../client/components/ui/input'
import { MagnifyingGlass } from '@phosphor-icons/react'
import {
  type Champion,
  type ChampionRole,
  filterChampions,
  getChampionImageUrl,
} from '../services/championService'
import { getChampionsFromDb } from 'wasp/client/operations'
import { Button } from '../../client/components/ui/button'

// Track which splash arts have been prefetched
const prefetchedSplashArts = new Set<string>()

// Helper function to prefetch an image using link tags
const prefetchImage = (src: string) => {
  if (prefetchedSplashArts.has(src)) return

  // Create a link element for better browser prefetching
  const link = document.createElement('link')
  link.rel = 'prefetch'
  link.as = 'image'
  link.href = src
  document.head.appendChild(link)

  prefetchedSplashArts.add(src)
}

export interface ChampionGridProps {
  onSelect: (champion: Champion) => void
  disabled?: boolean
  bannedChampions?: string[]
  usedChampions?: string[]
  isPickPhase?: boolean
}

const POSITION_ICONS_BASE_URL =
  'https://raw.communitydragon.org/latest/plugins/rcp-fe-lol-clash/global/default/assets/images/position-selector/positions'

const roleIcons: Record<ChampionRole, string> = {
  top: `${POSITION_ICONS_BASE_URL}/icon-position-top.png`,
  jungle: `${POSITION_ICONS_BASE_URL}/icon-position-jungle.png`,
  mid: `${POSITION_ICONS_BASE_URL}/icon-position-middle.png`,
  bot: `${POSITION_ICONS_BASE_URL}/icon-position-bottom.png`,
  support: `${POSITION_ICONS_BASE_URL}/icon-position-utility.png`,
}

export function ChampionGrid({
  onSelect,
  disabled = false,
  bannedChampions = [],
  usedChampions = [],
  isPickPhase = false,
}: ChampionGridProps) {
  const [champions, setChampions] = useState<Champion[]>([])
  const [filteredChampions, setFilteredChampions] = useState<Champion[]>([])
  const [search, setSearch] = useState('')
  const [selectedRole, setSelectedRole] = useState<ChampionRole | null>(null)
  const [showAvailableOnly, setShowAvailableOnly] = useState(false)

  // Cleanup prefetch links on unmount
  useEffect(() => {
    return () => {
      document
        .querySelectorAll('link[rel="prefetch"][as="image"]')
        .forEach(link => {
          link.remove()
        })
    }
  }, [])

  useEffect(() => {
    // Get champions from cache
    getChampionsFromDb().then(data => {
      setChampions(data)
      setFilteredChampions(data)

      // Only prefetch splash art during pick phase
      if (isPickPhase) {
        data.slice(0, 10).forEach(champion => {
          prefetchImage(getChampionImageUrl(champion, 'splash'))
        })
      }
    })
  }, [isPickPhase])

  useEffect(() => {
    let filtered = filterChampions(champions, search)
    if (selectedRole) {
      filtered = filtered.filter(champion =>
        champion.roles.includes(selectedRole),
      )
    }
    if (showAvailableOnly) {
      filtered = filtered.filter(
        champion =>
          !bannedChampions.includes(champion.id) &&
          !usedChampions.includes(champion.id),
      )
    }
    setFilteredChampions(filtered)
  }, [
    search,
    champions,
    selectedRole,
    showAvailableOnly,
    bannedChampions,
    usedChampions,
  ])

  return (
    <div className='flex h-full w-full flex-col rounded-md bg-muted p-2'>
      {/* Search and Filters */}
      <div className='flex items-center gap-2 p-2'>
        {/* Search */}
        <div className='relative'>
          <MagnifyingGlass
            className='absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground'
            size={14}
          />
          <Input
            type='text'
            placeholder='Search champions...'
            value={search}
            onChange={e => setSearch(e.target.value)}
            className='h-8 pl-7 font-sans text-sm'
          />
        </div>

        {/* Role Filter */}
        <div className='flex gap-2'>
          {Object.entries(roleIcons).map(([role, iconUrl]) => (
            <Button
              key={role}
              variant={selectedRole === role ? 'secondary' : 'ghost'}
              size='icon'
              className={`h-8 w-8 p-1 transition-all ${
                selectedRole === role
                  ? 'bg-primary/20 ring-2 ring-primary ring-offset-2 ring-offset-background'
                  : 'hover:bg-muted-foreground/10'
              }`}
              onClick={() =>
                setSelectedRole(
                  selectedRole === role ? null : (role as ChampionRole),
                )
              }
            >
              <img
                src={iconUrl}
                alt={role}
                className={`transition-all ${
                  selectedRole === role
                    ? 'brightness-100'
                    : 'opacity-50 group-hover:opacity-75'
                }`}
              />
            </Button>
          ))}

          {/* Available Filter */}
          <Button
            variant={showAvailableOnly ? 'secondary' : 'ghost'}
            size='sm'
            className={`h-8 whitespace-nowrap text-xs font-semibold transition-all ${
              showAvailableOnly
                ? 'bg-primary/20 text-primary ring-2 ring-primary ring-offset-2 ring-offset-background'
                : 'text-muted-foreground hover:bg-muted-foreground/10'
            }`}
            onClick={() => setShowAvailableOnly(!showAvailableOnly)}
          >
            Available Only
          </Button>
        </div>
      </div>

      {/* Grid Container */}
      <div className='flex min-h-0 overflow-y-auto p-2'>
        <div className='flex flex-wrap gap-2'>
          {filteredChampions.map(champion => {
            const isUsed = usedChampions.includes(champion.id)
            const isBanned = bannedChampions.includes(champion.id)
            const isDisabled = disabled || isUsed || isBanned
            return (
              <button
                key={champion.id}
                onClick={() => onSelect(champion)}
                onMouseEnter={() => {
                  if (isPickPhase) {
                    prefetchImage(getChampionImageUrl(champion, 'splash'))
                  }
                }}
                disabled={isDisabled}
                className={`group relative flex aspect-square w-10 flex-col items-center justify-center transition-colors sm:w-12 lg:w-14 xl:w-16 2xl:w-20 ${isDisabled ? 'cursor-not-allowed opacity-50' : 'cursor-pointer'} select-none overflow-hidden`}
                title={`${champion.name}${isUsed ? ' (Already picked in this series)' : isBanned ? ' (Banned this game)' : ''}`}
              >
                <div className='relative h-full w-full'>
                  <img
                    src={getChampionImageUrl(champion)}
                    alt={champion.name}
                    className={`absolute inset-0 h-full w-full object-cover object-center transition-all group-hover:scale-105 ${isUsed ? 'grayscale' : isBanned ? 'brightness-50' : 'group-hover:scale-135'} select-none`}
                    loading='lazy'
                    draggable='false'
                  />
                  <div
                    className={`absolute inset-0 bg-black/50 ${isUsed || isBanned ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'} flex items-center justify-center p-1 transition-opacity`}
                  >
                    <span>
                      {isUsed && (
                        <div className='font-inter text-[0.8rem] font-bold text-red-400'>
                          Already Picked
                        </div>
                      )}
                      {isBanned && (
                        <div className='font-inter text-[0.8rem] font-bold text-yellow-400'>
                          Banned
                        </div>
                      )}
                    </span>
                  </div>
                </div>
              </button>
            )
          })}
        </div>
      </div>
    </div>
  )
}
