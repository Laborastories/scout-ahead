import { useQuery, getAdminStats } from 'wasp/client/operations'
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
  CaretRight,
} from '@phosphor-icons/react'
import { useState, useEffect } from 'react'
import { Button } from '../client/components/ui/button'
import { Link } from 'wasp/client/router'
import { useNavigate } from 'react-router-dom'
import { type GetAdminStatsOperation } from './operations'

export type AdminStats = Awaited<ReturnType<GetAdminStatsOperation>>

export function AdminDashboardPage() {
  const { data: user } = useAuth()
  const navigate = useNavigate()
  const [page, setPage] = useState(1)
  const itemsPerPage = 10

  const {
    data: stats,
    isLoading,
    error,
  } = useQuery(getAdminStats, {
    enabled: !!user?.isAdmin,
  })

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

  // Pagination calculations
  const totalPages = Math.ceil(adminStats.users.length / itemsPerPage)
  const startIndex = (page - 1) * itemsPerPage
  const endIndex = startIndex + itemsPerPage
  const currentUsers = adminStats.users.slice(startIndex, endIndex)

  return (
    <motion.div
      initial='initial'
      animate='animate'
      exit='exit'
      variants={fadeIn}
      className='container mx-auto py-8'
    >
      <div className='mb-8'>
        <h1 className='text-4xl font-bold'>Admin Dashboard</h1>
        <p className='font-sans text-muted-foreground'>
          Monitor your platform&apos;s performance and user activity
        </p>
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
              {currentUsers.map(user => (
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
          {/* Pagination Controls */}
          <div className='mt-4 flex items-center justify-between font-sans'>
            <div className='text-sm text-muted-foreground'>
              Showing {startIndex + 1}-
              {Math.min(endIndex, adminStats.users.length)} of{' '}
              {adminStats.users.length} users
            </div>
            <div className='flex gap-2'>
              <Button
                variant='outline'
                size='sm'
                onClick={() => setPage(p => Math.max(1, p - 1))}
                disabled={page === 1}
              >
                Previous
              </Button>
              <Button
                variant='outline'
                size='sm'
                onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                disabled={page === totalPages}
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
                <TableHead className='font-sans'>Date</TableHead>
                <TableHead className='font-sans'>Team 1</TableHead>
                <TableHead className='font-sans'>Team 2</TableHead>
                <TableHead className='font-sans'>Format</TableHead>
                <TableHead className='font-sans'>Status</TableHead>
                <TableHead className='w-[50px]'></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody className='font-sans'>
              {adminStats.recentDrafts.map(draft => (
                <TableRow
                  key={draft.id}
                  className='group cursor-pointer hover:bg-muted/50'
                >
                  <Link
                    to='/draft/:seriesId/:gameNumber'
                    params={{ seriesId: draft.id, gameNumber: 1 }}
                    className='contents'
                  >
                    <TableCell>
                      {new Date(draft.createdAt).toLocaleDateString()}
                    </TableCell>
                    <TableCell className='font-medium'>
                      {draft.team1Name}
                    </TableCell>
                    <TableCell className='font-medium'>
                      {draft.team2Name}
                    </TableCell>
                    <TableCell>{draft.format}</TableCell>
                    <TableCell>
                      <span
                        className={`inline-flex items-center rounded-full px-2 py-1 text-xs font-medium ${
                          draft.status === 'COMPLETED'
                            ? 'bg-green-100 text-green-700'
                            : draft.status === 'IN_PROGRESS'
                              ? 'bg-blue-100 text-blue-700'
                              : 'bg-yellow-100 text-yellow-700'
                        }`}
                      >
                        {draft.status.toLowerCase()}
                      </span>
                    </TableCell>
                    <TableCell>
                      <CaretRight className='h-4 w-4 opacity-0 transition-opacity group-hover:opacity-100' />
                    </TableCell>
                  </Link>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </motion.div>
  )
}
