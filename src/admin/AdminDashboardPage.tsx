import {
  useQuery,
  getAdminStats,
  triggerChampionUpdate,
  triggerChampionImageUpdate,
} from 'wasp/client/operations'
import { useAuth } from 'wasp/client/auth'
import { motion } from 'motion/react'
import { fadeIn } from '../motion/transitionPresets'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '../client/components/ui/table'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '../client/components/ui/card'
import {
  Users,
  GameController,
  Crown,
  ChartLine,
  ArrowClockwise,
} from '@phosphor-icons/react'
import { useState, useEffect } from 'react'
import { Button } from '../client/components/ui/button'
import { Link } from 'wasp/client/router'
import { useNavigate } from 'react-router-dom'
import { type GetAdminStatsOperation } from './operations'
import { formatDistanceToNow } from 'date-fns'
import { cn } from '../lib/utils'
import { useToast } from '../hooks/use-toast'

export type AdminStats = Awaited<ReturnType<GetAdminStatsOperation>>

export function AdminDashboardPage() {
  const { data: user } = useAuth()
  const navigate = useNavigate()
  const [userPage, setUserPage] = useState(1)
  const [draftPage, setDraftPage] = useState(1)
  const [isUpdatingChampions, setIsUpdatingChampions] = useState(false)
  const [isUpdatingImages, setIsUpdatingImages] = useState(false)
  const { toast } = useToast()
  const itemsPerPage = 10

  const {
    data: stats,
    isLoading,
    error,
  } = useQuery(
    getAdminStats,
    {
      draftsPage: draftPage,
      draftsPerPage: itemsPerPage,
      usersPage: userPage,
      usersPerPage: itemsPerPage,
    },
    {
      enabled: !!user?.isAdmin,
    },
  )

  useEffect(() => {
    if (user && !user.isAdmin) {
      navigate('/')
    }
  }, [user, navigate])

  if (!user || !user.isAdmin) {
    return (
      <div className='flex min-h-screen items-center justify-center bg-background'>
        <div className='text-destructive'>
          Unauthorized: Admin access required
        </div>
      </div>
    )
  }

  if (isLoading) {
    return (
      <div className='flex min-h-screen items-center justify-center bg-background'>
        <div className='text-foreground'>Loading stats...</div>
      </div>
    )
  }

  if (error) {
    return (
      <div className='flex min-h-screen items-center justify-center bg-background'>
        <div className='text-destructive'>Error: {error.message}</div>
      </div>
    )
  }

  if (!stats) {
    return (
      <div className='flex min-h-screen items-center justify-center bg-background'>
        <div className='text-foreground'>No stats available</div>
      </div>
    )
  }

  const adminStats = stats as unknown as AdminStats

  // Pagination calculations for users
  const totalUserPages = Math.ceil(adminStats.totalUsers / itemsPerPage)
  const userStartIndex = (userPage - 1) * itemsPerPage
  const userEndIndex = userStartIndex + adminStats.users.length

  // Pagination calculations for drafts
  const totalDraftPages = Math.ceil(adminStats.totalDrafts / itemsPerPage)
  const draftStartIndex = (draftPage - 1) * itemsPerPage
  const draftEndIndex = draftStartIndex + adminStats.recentDrafts.length

  const handleUpdateChampions = async () => {
    setIsUpdatingChampions(true)
    try {
      await triggerChampionUpdate({})
      toast({
        title: 'Champion Update Started',
        description: 'The champion data update job has been triggered.',
      })
    } catch (error) {
      console.error('Failed to trigger champion update:', error)
      toast({
        title: 'Error',
        description: 'Failed to trigger champion update job.',
        variant: 'destructive',
      })
    } finally {
      setIsUpdatingChampions(false)
    }
  }

  const handleUpdateImages = async () => {
    setIsUpdatingImages(true)
    try {
      await triggerChampionImageUpdate({})
      toast({
        title: 'Image Update Started',
        description: 'The champion images update job has been triggered.',
      })
    } catch (error) {
      console.error('Failed to trigger image update:', error)
      toast({
        title: 'Error',
        description: 'Failed to trigger image update job.',
        variant: 'destructive',
      })
    } finally {
      setIsUpdatingImages(false)
    }
  }

  return (
    <motion.div
      initial='initial'
      animate='animate'
      exit='exit'
      variants={fadeIn}
      className='container mx-auto py-8'
    >
      <div className='mb-8'>
        <div className='flex items-center justify-between'>
          <div>
            <h1 className='text-4xl font-bold'>Admin Dashboard</h1>
            <p className='font-sans text-muted-foreground'>
              Monitor your platform&apos;s performance and user activity
            </p>
          </div>
          <div className='flex items-center gap-2'>
            <Button
              variant='outline'
              size='sm'
              onClick={handleUpdateChampions}
              disabled={isUpdatingChampions}
              className='flex items-center gap-2'
            >
              <ArrowClockwise
                size={16}
                className={cn(isUpdatingChampions && 'animate-spin')}
              />
              Update Champions
            </Button>
            <Button
              variant='outline'
              size='sm'
              onClick={handleUpdateImages}
              disabled={isUpdatingImages}
              className='flex items-center gap-2'
            >
              <ArrowClockwise
                size={16}
                className={cn(isUpdatingImages && 'animate-spin')}
              />
              Update Images
            </Button>
          </div>
        </div>
      </div>

      {/* Stats Overview */}
      <div className='mb-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4'>
        <Card>
          <CardHeader className='flex flex-row items-center justify-between space-y-0 pb-2'>
            <CardTitle className='text-sm font-medium'>Total Users</CardTitle>
            <Users size={32} className='text-muted-foreground' />
          </CardHeader>
          <CardContent>
            <div className='text-2xl font-bold'>{adminStats.totalUsers}</div>
            <p className='font-sans text-xs text-muted-foreground'>
              {adminStats.activeUsers24h} active in last 24h
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className='flex flex-row items-center justify-between space-y-0 pb-2'>
            <CardTitle className='text-sm font-medium'>Total Drafts</CardTitle>
            <GameController size={32} className='text-muted-foreground' />
          </CardHeader>
          <CardContent>
            <div className='text-2xl font-bold'>{adminStats.totalDrafts}</div>
            <p className='font-sans text-xs text-muted-foreground'>
              {adminStats.draftsToday} drafts today
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className='flex flex-row items-center justify-between space-y-0 pb-2'>
            <CardTitle className='text-sm font-medium'>Games Played</CardTitle>
            <Crown size={32} className='text-muted-foreground' />
          </CardHeader>
          <CardContent>
            <div className='text-2xl font-bold'>
              {adminStats.totalGamesPlayed}
            </div>
            <p className='font-sans text-xs text-muted-foreground'>
              Across all drafts
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className='flex flex-row items-center justify-between space-y-0 pb-2'>
            <CardTitle className='text-sm font-medium'>
              Avg. Games per Draft
            </CardTitle>
            <ChartLine size={32} className='text-muted-foreground' />
          </CardHeader>
          <CardContent>
            <div className='text-2xl font-bold'>
              {(adminStats.totalGamesPlayed / adminStats.totalDrafts).toFixed(
                1,
              )}
            </div>
            <p className='font-sans text-xs text-muted-foreground'>
              Games completed
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Users Table */}
      <Card className='mb-8'>
        <CardHeader>
          <CardTitle>Users</CardTitle>
          <CardDescription className='font-sans'>
            A list of all users registered on the platform.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className='font-sans'>Username</TableHead>
                <TableHead className='font-sans'>Email</TableHead>
                <TableHead className='font-sans'>Joined</TableHead>
                <TableHead className='font-sans'>Last Active</TableHead>
                <TableHead className='text-right font-sans'>
                  Total Drafts
                </TableHead>
                <TableHead className='text-right font-sans'>
                  Total Games
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody className='font-sans'>
              {adminStats.users.map(user => (
                <TableRow key={user.id}>
                  <TableCell className='font-medium'>{user.username}</TableCell>
                  <TableCell>{user.email}</TableCell>
                  <TableCell>
                    {new Date(user.createdAt).toLocaleDateString()}
                  </TableCell>
                  <TableCell>
                    {new Date(user.lastActiveTimestamp).toLocaleDateString()}
                  </TableCell>
                  <TableCell className='text-right'>
                    {user.totalDrafts}
                  </TableCell>
                  <TableCell className='text-right'>
                    {user.totalGames}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          {/* Users Table Pagination */}
          <div className='mt-4 flex items-center justify-between font-sans'>
            <div className='text-sm text-muted-foreground'>
              Showing {userStartIndex + 1}-{userEndIndex} of{' '}
              {adminStats.totalUsers} users
            </div>
            <div className='flex gap-2'>
              <Button
                variant='outline'
                size='sm'
                onClick={() => setUserPage(p => Math.max(1, p - 1))}
                disabled={userPage === 1}
              >
                Previous
              </Button>
              <Button
                variant='outline'
                size='sm'
                onClick={() =>
                  setUserPage(p => Math.min(totalUserPages, p + 1))
                }
                disabled={userPage === totalUserPages}
              >
                Next
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Recent Drafts */}
      <Card>
        <CardHeader>
          <CardTitle>Recent Drafts</CardTitle>
          <CardDescription className='font-sans'>
            The latest drafts created on the platform.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Created</TableHead>
                <TableHead>Team 1</TableHead>
                <TableHead>Team 2</TableHead>
                <TableHead>Format</TableHead>
                <TableHead>Features</TableHead>
                <TableHead>Creator</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Links</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody className='font-sans'>
              {adminStats.recentDrafts.map(draft => (
                <TableRow key={draft.id}>
                  <Link
                    to='/draft/:seriesId/:gameNumber'
                    params={{ seriesId: draft.id, gameNumber: '1' }}
                    className='contents'
                  >
                    <TableCell>
                      {formatDistanceToNow(new Date(draft.createdAt), {
                        addSuffix: true,
                      })}
                    </TableCell>
                    <TableCell>{draft.team1Name}</TableCell>
                    <TableCell>{draft.team2Name}</TableCell>
                    <TableCell>{draft.format}</TableCell>
                    <TableCell>
                      <div className='flex gap-2'>
                        {draft.fearlessDraft && (
                          <div className='rounded bg-amber-950 px-1.5 py-0.5 text-xs font-medium text-amber-500'>
                            F
                          </div>
                        )}
                        {draft.scrimBlock && (
                          <div className='rounded bg-indigo-950 px-1.5 py-0.5 text-xs font-medium text-indigo-400'>
                            S
                          </div>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      {draft.creator ? (
                        <div className='flex flex-col'>
                          <span className='font-medium'>
                            {draft.creator.username}
                          </span>
                          <span className='text-xs text-muted-foreground'>
                            {draft.creator.email}
                          </span>
                        </div>
                      ) : (
                        <span className='text-xs text-muted-foreground'>
                          Anonymous
                        </span>
                      )}
                    </TableCell>
                    <TableCell>
                      <div
                        className={cn(
                          'w-fit rounded px-2 py-0.5 text-xs font-medium',
                          draft.status === 'COMPLETED'
                            ? 'bg-green-500/10 text-green-500'
                            : draft.status === 'IN_PROGRESS'
                              ? 'bg-blue-500/10 text-blue-500'
                              : 'bg-muted text-muted-foreground',
                        )}
                      >
                        {draft.status}
                      </div>
                    </TableCell>
                  </Link>
                  <TableCell>
                    <div className='flex items-center gap-2'>
                      <Button
                        variant='ghost'
                        size='sm'
                        className='h-6 px-2 text-xs'
                        asChild
                      >
                        <a
                          href={`/draft/${draft.id}/1/team1/${draft.team1AuthToken}`}
                          target='_blank'
                          rel='noopener noreferrer'
                          onClick={e => e.stopPropagation()}
                        >
                          <div className='flex items-center gap-1'>
                            <span className='font-medium'>Team 1</span>
                          </div>
                        </a>
                      </Button>
                      <Button
                        variant='ghost'
                        size='sm'
                        className='h-6 px-2 text-xs'
                        asChild
                      >
                        <a
                          href={`/draft/${draft.id}/1/team2/${draft.team2AuthToken}`}
                          target='_blank'
                          rel='noopener noreferrer'
                          onClick={e => e.stopPropagation()}
                        >
                          <div className='flex items-center gap-1'>
                            <span className='font-medium'>Team 2</span>
                          </div>
                        </a>
                      </Button>
                      <Button
                        variant='ghost'
                        size='sm'
                        className='h-6 px-2 text-xs'
                        asChild
                      >
                        <a
                          href={`/draft/${draft.id}/1`}
                          target='_blank'
                          rel='noopener noreferrer'
                          onClick={e => e.stopPropagation()}
                        >
                          <div className='flex items-center gap-1'>
                            <span className='font-medium'>View</span>
                          </div>
                        </a>
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          {/* Drafts Table Pagination */}
          <div className='mt-4 flex items-center justify-between font-sans'>
            <div className='text-sm text-muted-foreground'>
              Showing {draftStartIndex + 1}-{draftEndIndex} of{' '}
              {adminStats.totalDrafts} drafts
            </div>
            <div className='flex gap-2'>
              <Button
                variant='outline'
                size='sm'
                onClick={() => setDraftPage(p => Math.max(1, p - 1))}
                disabled={draftPage === 1}
              >
                Previous
              </Button>
              <Button
                variant='outline'
                size='sm'
                onClick={() =>
                  setDraftPage(p => Math.min(totalDraftPages, p + 1))
                }
                disabled={draftPage === totalDraftPages}
              >
                Next
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
    </motion.div>
  )
}
