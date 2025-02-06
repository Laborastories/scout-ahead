import { useState, useEffect, useRef } from 'react'
import { Input } from '../../client/components/ui/input'
import { MagnifyingGlass, X } from '@phosphor-icons/react'
import {
  type Champion,
  type ChampionRole,
  filterChampions,
  getChampionImageUrl,
  DDRAGON_VERSION,
} from '../services/championService'
import { getChampionsFromDb } from 'wasp/client/operations'
import { Button } from '../../client/components/ui/button'

// Track which icons have been prefetched
const prefetchedIcons = new Set<string>()

// Helper function to prefetch an image using link tags
const prefetchImage = (src: string) => {
  if (prefetchedIcons.has(src)) return

  const link = document.createElement('link')
  link.rel = 'prefetch'
  link.as = 'image'
  link.href = src
  document.head.appendChild(link)

  prefetchedIcons.add(src)
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
  const [visibleChampions, setVisibleChampions] = useState<Set<string>>(
    new Set(),
  )
  const gridRef = useRef<HTMLDivElement>(null)

  // Intersection observer for lazy loading
  useEffect(() => {
    const observer = new IntersectionObserver(
      entries => {
        entries.forEach(entry => {
          if (entry.isIntersecting) {
            const championId = entry.target.getAttribute('data-champion-id')
            if (championId) {
              setVisibleChampions(prev => new Set(prev).add(championId))
              observer.unobserve(entry.target)
            }
          }
        })
      },
      {
        root: gridRef.current,
        rootMargin: '50px',
        threshold: 0.1,
      },
    )

    // Observe all champion containers
    document.querySelectorAll('[data-champion-id]').forEach(el => {
      observer.observe(el)
    })

    return () => observer.disconnect()
  }, [filteredChampions])

  // Prefetch visible champion icons
  useEffect(() => {
    visibleChampions.forEach(championId => {
      const champion = champions.find(c => c.id === championId)
      if (champion) {
        prefetchImage(getChampionImageUrl(champion))
      }
    })
  }, [visibleChampions, champions])

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
            className='h-8 pl-7 pr-7 font-sans text-sm'
          />
          {search && (
            <button
              onClick={() => setSearch('')}
              className='absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground'
            >
              <X size={14} />
            </button>
          )}
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
      <div className='flex min-h-0 overflow-y-auto p-2' ref={gridRef}>
        <div className='flex flex-wrap gap-2'>
          {filteredChampions.map(champion => {
            const isUsed = usedChampions.includes(champion.id)
            const isBanned = bannedChampions.includes(champion.id)
            const isDisabled = disabled || isUsed || isBanned
            const isVisible = visibleChampions.has(champion.id)

            return (
              <button
                key={champion.id}
                data-champion-id={champion.id}
                onClick={() => onSelect(champion)}
                onMouseEnter={() => {
                  if (isPickPhase) {
                    prefetchImage(getChampionImageUrl(champion, 'splash'))
                  }
                }}
                disabled={isDisabled}
                className={`group relative flex aspect-square w-10 flex-col items-center justify-center transition-colors sm:w-12 lg:w-14 xl:w-16 2xl:w-20 ${
                  isDisabled
                    ? 'cursor-not-allowed opacity-50'
                    : 'cursor-pointer'
                } select-none overflow-hidden`}
                title={`${champion.name}${
                  isUsed
                    ? ' (Already picked in this series)'
                    : isBanned
                      ? ' (Banned this game)'
                      : ''
                }`}
              >
                <div className='relative h-full w-full'>
                  {isVisible && (
                    <img
                      src={getChampionImageUrl(champion)}
                      alt={champion.name}
                      className={`absolute inset-0 h-full w-full object-cover object-center transition-all group-hover:scale-105 ${
                        isUsed
                          ? 'grayscale'
                          : isBanned
                            ? 'brightness-50'
                            : 'group-hover:scale-135'
                      } select-none`}
                      loading='eager'
                      decoding='async'
                      draggable='false'
                      onError={e => {
                        // If S3 fails, try DDragon directly
                        const img = e.currentTarget
                        if (!img.src.includes('ddragon')) {
                          img.src = `https://ddragon.leagueoflegends.com/cdn/${DDRAGON_VERSION}/img/champion/${champion.id}.png`
                        } else {
                          // If DDragon fails too, show a placeholder
                          img.src =
                            'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="100%" height="100%" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"%3E%3Crect x="3" y="3" width="18" height="18" rx="2" ry="2"%3E%3C/rect%3E%3Ccircle cx="12" cy="12" r="5"%3E%3C/circle%3E%3Cline x1="3" y1="3" x2="21" y2="21"%3E%3C/line%3E%3C/svg%3E'
                          img.classList.add('p-2', 'opacity-25')
                        }
                      }}
                    />
                  )}
                  <div
                    className={`absolute inset-0 bg-black/50 ${
                      isUsed || isBanned
                        ? 'opacity-100'
                        : 'opacity-0 group-hover:opacity-100'
                    } flex items-center justify-center p-1 transition-opacity`}
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
