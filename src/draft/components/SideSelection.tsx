import { useSocket } from 'wasp/client/webSocket'
import { type Series } from 'wasp/entities'
import { useState } from 'react'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '../../client/components/ui/alert-dialog'

type SideSelectionProps = {
  series: Series
  gameNumber: number
  side?: 'team1' | 'team2'
}

export function SideSelection({
  series,
  gameNumber,
  side,
}: SideSelectionProps) {
  const { socket } = useSocket()
  const [selectedSide, setSelectedSide] = useState<'blue' | 'red' | null>(null)

  const handleSideSelect = (side: 'blue' | 'red') => {
    setSelectedSide(side)
  }

  const handleConfirm = () => {
    if (!socket || !selectedSide) return
    socket.emit('selectSide', {
      seriesId: series.id,
      gameNumber,
      side: selectedSide,
      auth: side === 'team1' ? series.team1AuthToken : series.team2AuthToken,
    })
    setSelectedSide(null)
  }

  // If no side is provided, this is a spectator
  if (!side) {
    return (
      <div className='space-y-6'>
        <h3 className='text-center text-lg font-medium'>Waiting for Teams</h3>
        <div className='text-center text-sm text-muted-foreground'>
          Teams are selecting their sides for this game...
        </div>
        <div className='grid grid-cols-2 gap-4 opacity-50'>
          <div className='rounded-lg bg-[hsl(var(--team-blue))] p-6'>
            <div className='font-medium text-[hsl(var(--team-blue-foreground))]'>
              Blue Side
            </div>
            <div className='text-sm text-[hsl(var(--team-blue-foreground))/0.8]'>
              Waiting for team...
            </div>
          </div>
          <div className='rounded-lg bg-[hsl(var(--team-red))] p-6'>
            <div className='font-medium text-[hsl(var(--team-red-foreground))]'>
              Red Side
            </div>
            <div className='text-sm text-[hsl(var(--team-red-foreground))/0.8]'>
              Waiting for team...
            </div>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className='space-y-6'>
      <div className='space-y-2 text-center'>
        <h3 className='text-lg font-medium'>
          Select Side for{' '}
          {side === 'team1' ? series.team1Name : series.team2Name}
        </h3>
        <div className='text-sm text-muted-foreground'>
          You are using{' '}
          <span className='font-medium text-foreground'>
            {side === 'team1' ? series.team1Name : series.team2Name}&apos;s
          </span>{' '}
          team URL
        </div>
      </div>
      <div className='grid grid-cols-2 gap-4'>
        <button
          onClick={() => handleSideSelect('blue')}
          className='rounded-lg bg-[hsl(var(--team-blue))] p-6 transition-transform hover:scale-[1.02]'
        >
          <div className='font-medium text-[hsl(var(--team-blue-foreground))]'>
            Blue Side
          </div>
          <div className='text-sm text-[hsl(var(--team-blue-foreground))/0.8]'>
            Click to play on Blue Side
          </div>
        </button>
        <button
          onClick={() => handleSideSelect('red')}
          className='rounded-lg bg-[hsl(var(--team-red))] p-6 transition-transform hover:scale-[1.02]'
        >
          <div className='font-medium text-[hsl(var(--team-red-foreground))]'>
            Red Side
          </div>
          <div className='text-sm text-[hsl(var(--team-red-foreground))/0.8]'>
            Click to play on Red Side
          </div>
        </button>
      </div>

      <AlertDialog
        open={!!selectedSide}
        onOpenChange={() => setSelectedSide(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirm Side Selection</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to play on{' '}
              {selectedSide === 'blue' ? 'Blue' : 'Red'} side? This cannot be
              changed once confirmed.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleConfirm}>
              Confirm {selectedSide === 'blue' ? 'Blue' : 'Red'} Side
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
