import {
  useQuery,
  getAdminStats,
  getReports,
  updateReport,
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
  Clock,
  Eye,
  Check,
  X,
  Prohibit,
} from '@phosphor-icons/react'
import { useState, useEffect } from 'react'
import { Button } from '../client/components/ui/button'
import { Link } from 'wasp/client/router'
import { useNavigate } from 'react-router-dom'
import {
  type GetAdminStatsResponse,
  type GetReportsResponse,
} from './operations'
import { formatDistanceToNow } from 'date-fns'
import { cn } from '../lib/utils'
import { useToast } from '../hooks/use-toast'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '../client/components/ui/dialog'
import { Textarea } from '../client/components/ui/textarea'
import { useForm } from 'react-hook-form'
import { z } from 'zod'
import { zodResolver } from '@hookform/resolvers/zod'
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '../client/components/ui/form'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '../client/components/ui/tooltip'
import { RadioGroup, RadioGroupItem } from '../client/components/ui/radio-group'

const reviewSchema = z.object({
  status: z.enum(['PENDING', 'REVIEWED', 'RESOLVED', 'DISMISSED', 'BLOCKED']),
  reviewNote: z.string().optional(),
})

type ReviewFormData = z.infer<typeof reviewSchema>

const statusConfig = {
  PENDING: {
    icon: Clock,
    label: 'Pending',
    description: 'Report has not been reviewed yet',
    className: 'text-amber-500',
  },
  REVIEWED: {
    icon: Eye,
    label: 'Reviewed',
    description: 'Report has been reviewed but no action taken yet',
    className: 'text-blue-500',
  },
  RESOLVED: {
    icon: Check,
    label: 'Resolved',
    description: 'Report has been handled and appropriate action was taken',
    className: 'text-green-500',
  },
  DISMISSED: {
    icon: X,
    label: 'Dismissed',
    description: 'Report was reviewed and determined to not require action',
    className: 'text-muted-foreground',
  },
  BLOCKED: {
    icon: Prohibit,
    label: 'Blocked',
    description:
      'Draft has been blocked due to inappropriate content - users cannot interact with it',
    className: 'text-destructive',
  },
} as const

export function AdminDashboardPage() {
  const { data: user } = useAuth()
  const navigate = useNavigate()
  const [userPage, setUserPage] = useState(1)
  const [draftPage, setDraftPage] = useState(1)
  const [reportPage, setReportPage] = useState(1)
  const [isUpdatingChampions, setIsUpdatingChampions] = useState(false)
  const [isUpdatingImages, setIsUpdatingImages] = useState(false)
  const { toast } = useToast()
  const itemsPerPage = 10
  const [selectedReport, setSelectedReport] = useState<
    GetReportsResponse['reports'][number] | null
  >(null)

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

  const {
    data: reportsData,
    isLoading: isLoadingReports,
    error: reportsError,
  } = useQuery(
    getReports,
    {
      page: reportPage,
      perPage: itemsPerPage,
    },
    {
      enabled: !!user?.isAdmin,
    },
  )

  const form = useForm<ReviewFormData>({
    resolver: zodResolver(reviewSchema),
    defaultValues: {
      status: 'REVIEWED',
      reviewNote: '',
    },
  })

  useEffect(() => {
    if (selectedReport) {
      // Reset form with the current report's values
      form.reset({
        status: selectedReport.status as ReviewFormData['status'],
        reviewNote: selectedReport.reviewNote || '',
      })
    }
  }, [selectedReport, form])

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

  if (isLoading || isLoadingReports) {
    return (
      <div className='flex min-h-screen items-center justify-center bg-background'>
        <div className='text-foreground'>Loading...</div>
      </div>
    )
  }

  if (error || reportsError) {
    return (
      <div className='flex min-h-screen items-center justify-center bg-background'>
        <div className='text-destructive'>
          Error: {error?.message || reportsError?.message}
        </div>
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

  const adminStats = stats as GetAdminStatsResponse

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

  const onReviewSubmit = async (data: ReviewFormData) => {
    if (!selectedReport) return

    try {
      await updateReport({
        reportId: selectedReport.id,
        status: data.status,
        reviewNote: data.reviewNote,
      })

      toast({
        title: 'Report Updated',
        description: 'The report has been successfully reviewed.',
      })

      setSelectedReport(null)
      form.reset()
    } catch (err) {
      console.error('Failed to update report:', err)
      toast({
        title: 'Error',
        description: 'Failed to update report.',
        variant: 'destructive',
      })
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

      {/* Reports Table */}
      <Card className='mb-8'>
        <CardHeader>
          <CardTitle>Reports</CardTitle>
          <CardDescription className='font-sans'>
            Review and manage reported drafts.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className='font-sans'>Reported</TableHead>
                <TableHead className='font-sans'>Status</TableHead>
                <TableHead className='font-sans'>Reason</TableHead>
                <TableHead className='font-sans'>Reporter</TableHead>
                <TableHead className='font-sans'>Draft</TableHead>
                <TableHead className='font-sans'>Details</TableHead>
                <TableHead className='font-sans'>Reviewed By</TableHead>
                <TableHead className='font-sans'>Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody className='font-sans'>
              {reportsData?.reports.map(
                (report: GetReportsResponse['reports'][number]) => (
                  <TableRow key={report.id}>
                    <TableCell>
                      {formatDistanceToNow(new Date(report.createdAt), {
                        addSuffix: true,
                      })}
                    </TableCell>
                    <TableCell>
                      <div
                        className={cn(
                          'w-fit rounded px-2 py-0.5 text-xs font-medium',
                          statusConfig[
                            report.status as keyof typeof statusConfig
                          ].className,
                        )}
                      >
                        {
                          statusConfig[
                            report.status as keyof typeof statusConfig
                          ].label
                        }
                      </div>
                    </TableCell>
                    <TableCell>{report.reason}</TableCell>
                    <TableCell>
                      {report.reporter ? (
                        <div className='flex flex-col'>
                          <span className='font-medium'>
                            {report.reporter.username}
                          </span>
                          <span className='text-xs text-muted-foreground'>
                            {report.reporter.email}
                          </span>
                        </div>
                      ) : (
                        <span className='text-xs text-muted-foreground'>
                          Anonymous
                        </span>
                      )}
                    </TableCell>
                    <TableCell>
                      <Link
                        to='/draft/:seriesId/:gameNumber'
                        params={{
                          seriesId: report.series.id,
                          gameNumber: '1',
                        }}
                        className='hover:underline'
                      >
                        {report.series.team1Name} vs {report.series.team2Name}
                      </Link>
                    </TableCell>
                    <TableCell className='max-w-[200px] truncate'>
                      {report.details || '-'}
                    </TableCell>
                    <TableCell>
                      {report.reviewedBy ? (
                        <div className='flex flex-col'>
                          <span className='font-medium'>
                            {report.reviewedBy.username}
                          </span>
                          <span className='text-xs text-muted-foreground'>
                            {report.reviewedBy.email}
                          </span>
                        </div>
                      ) : (
                        '-'
                      )}
                    </TableCell>
                    <TableCell>
                      <div className='flex items-center gap-2'>
                        <Dialog
                          open={!!selectedReport}
                          onOpenChange={open =>
                            !open && setSelectedReport(null)
                          }
                        >
                          <DialogTrigger asChild>
                            <Button
                              variant='outline'
                              size='sm'
                              className='h-6 px-2 text-xs'
                              onClick={() => setSelectedReport(report)}
                            >
                              Review
                            </Button>
                          </DialogTrigger>
                          <DialogContent>
                            <DialogHeader>
                              <DialogTitle>Review Report</DialogTitle>
                              <DialogDescription>
                                Update the status and add review notes for this
                                report.
                              </DialogDescription>
                            </DialogHeader>

                            <Form {...form}>
                              <form
                                onSubmit={form.handleSubmit(onReviewSubmit)}
                                className='space-y-4'
                              >
                                <FormField
                                  control={form.control}
                                  name='status'
                                  render={({ field }) => (
                                    <FormItem className='space-y-3'>
                                      <FormLabel>Status</FormLabel>
                                      <FormControl>
                                        <RadioGroup
                                          onValueChange={field.onChange}
                                          value={field.value}
                                          className='grid grid-cols-5 gap-2'
                                        >
                                          {(
                                            Object.entries(statusConfig) as [
                                              keyof typeof statusConfig,
                                              (typeof statusConfig)[keyof typeof statusConfig],
                                            ][]
                                          ).map(([status, config]) => {
                                            const Icon = config.icon
                                            return (
                                              <TooltipProvider key={status}>
                                                <Tooltip>
                                                  <TooltipTrigger asChild>
                                                    <div>
                                                      <RadioGroupItem
                                                        value={status}
                                                        id={status}
                                                        className='peer sr-only'
                                                      />
                                                      <label
                                                        htmlFor={status}
                                                        className={cn(
                                                          'flex flex-col items-center gap-2 rounded-lg border-2 border-muted bg-popover p-4 hover:bg-accent hover:text-accent-foreground peer-data-[state=checked]:border-primary [&:has([data-state=checked])]:border-primary',
                                                          'cursor-pointer transition-all',
                                                        )}
                                                      >
                                                        <Icon
                                                          size={24}
                                                          weight='duotone'
                                                          className={
                                                            config.className
                                                          }
                                                        />
                                                        <span className='text-xs font-medium'>
                                                          {config.label}
                                                        </span>
                                                      </label>
                                                    </div>
                                                  </TooltipTrigger>
                                                  <TooltipContent side='bottom'>
                                                    <p>{config.description}</p>
                                                  </TooltipContent>
                                                </Tooltip>
                                              </TooltipProvider>
                                            )
                                          })}
                                        </RadioGroup>
                                      </FormControl>
                                      <FormMessage />
                                    </FormItem>
                                  )}
                                />

                                <FormField
                                  control={form.control}
                                  name='reviewNote'
                                  render={({ field }) => (
                                    <FormItem>
                                      <FormLabel>Review Notes</FormLabel>
                                      <FormControl>
                                        <Textarea
                                          placeholder='Add any internal notes about this report'
                                          className='resize-none'
                                          {...field}
                                        />
                                      </FormControl>
                                      <FormMessage />
                                    </FormItem>
                                  )}
                                />

                                <div className='flex justify-end gap-2'>
                                  <Button
                                    type='button'
                                    variant='outline'
                                    onClick={() => {
                                      setSelectedReport(null)
                                      form.reset()
                                    }}
                                  >
                                    Cancel
                                  </Button>
                                  <Button
                                    type='submit'
                                    disabled={form.formState.isSubmitting}
                                  >
                                    Update Report
                                  </Button>
                                </div>
                              </form>
                            </Form>
                          </DialogContent>
                        </Dialog>

                        <Button
                          variant='ghost'
                          size='sm'
                          className='h-6 px-2 text-xs'
                          asChild
                        >
                          <Link
                            to='/draft/:seriesId/:gameNumber'
                            params={{
                              seriesId: report.series.id,
                              gameNumber: '1',
                            }}
                          >
                            View Draft
                          </Link>
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ),
              )}
            </TableBody>
          </Table>
          {/* Reports Table Pagination */}
          <div className='mt-4 flex items-center justify-between font-sans'>
            <div className='text-sm text-muted-foreground'>
              Showing {(reportPage - 1) * itemsPerPage + 1}-
              {Math.min(
                reportPage * itemsPerPage,
                reportsData?.totalReports || 0,
              )}{' '}
              of {reportsData?.totalReports || 0} reports
            </div>
            <div className='flex gap-2'>
              <Button
                variant='outline'
                size='sm'
                onClick={() => setReportPage(p => Math.max(1, p - 1))}
                disabled={reportPage === 1}
              >
                Previous
              </Button>
              <Button
                variant='outline'
                size='sm'
                onClick={() =>
                  setReportPage(p =>
                    Math.min(
                      Math.ceil(
                        (reportsData?.totalReports || 0) / itemsPerPage,
                      ),
                      p + 1,
                    ),
                  )
                }
                disabled={
                  reportPage ===
                  Math.ceil((reportsData?.totalReports || 0) / itemsPerPage)
                }
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
