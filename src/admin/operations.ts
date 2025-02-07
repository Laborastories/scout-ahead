import { HttpError } from 'wasp/server'
import {
  type GetAdminStats,
  type GetReports,
  type UpdateReport,
} from 'wasp/server/operations'
import { subHours, startOfDay } from 'date-fns'
import {
  type TriggerChampionUpdate,
  type TriggerChampionImageUpdate,
} from './types'
import { fetchChampionsJob, fetchChampionImagesJob } from 'wasp/server/jobs'

type UserWithSeries = {
  id: string
  username: string
  email: string
  createdAt: Date
  lastActiveTimestamp: Date
  createdSeries: {
    _count: {
      games: number
    }
  }[]
}

type SeriesWithTeams = {
  id: string
  createdAt: Date
  team1Name: string
  team2Name: string
  format: string
  status: string
}

type AdminStatsArgs = {
  draftsPage: number
  draftsPerPage: number
  usersPage: number
  usersPerPage: number
}

type ReportsArgs = {
  page: number
  perPage: number
}

export const getAdminStats = (async (args: AdminStatsArgs, context: any) => {
  if (!context.user?.isAdmin) {
    throw new HttpError(401, 'Unauthorized')
  }

  // Calculate pagination offsets
  const draftsSkip = (args.draftsPage - 1) * args.draftsPerPage
  const usersSkip = (args.usersPage - 1) * args.usersPerPage

  // Get total counts first
  const totalUsers = await context.entities.User.count()
  const totalDrafts = await context.entities.Series.count()

  // Get paginated users with their draft and game counts
  const users = (await context.entities.User.findMany({
    select: {
      id: true,
      username: true,
      email: true,
      createdAt: true,
      lastActiveTimestamp: true,
      createdSeries: {
        select: {
          _count: {
            select: {
              games: true,
            },
          },
        },
      },
    },
    orderBy: {
      createdAt: 'desc',
    },
    skip: usersSkip,
    take: args.usersPerPage,
  })) as UserWithSeries[]

  // Get paginated recent drafts
  const recentDrafts = (await context.entities.Series.findMany({
    select: {
      id: true,
      createdAt: true,
      team1Name: true,
      team2Name: true,
      format: true,
      status: true,
      fearlessDraft: true,
      scrimBlock: true,
      team1AuthToken: true,
      team2AuthToken: true,
      creator: {
        select: {
          username: true,
          email: true,
        },
      },
    },
    orderBy: {
      createdAt: 'desc',
    },
    skip: draftsSkip,
    take: args.draftsPerPage,
  })) as (SeriesWithTeams & {
    fearlessDraft: boolean
    scrimBlock: boolean
    team1AuthToken: string
    team2AuthToken: string
    creator: { username: string; email: string } | null
  })[]

  // Get active users in last 24h
  const activeUsers24h = await context.entities.User.count({
    where: {
      lastActiveTimestamp: {
        gte: subHours(new Date(), 24),
      },
    },
  })

  // Get total games played
  const totalGamesPlayed = await context.entities.Game.count({
    where: {
      status: 'COMPLETED',
    },
  })

  // Get drafts created today
  const draftsToday = await context.entities.Series.count({
    where: {
      createdAt: {
        gte: startOfDay(new Date()),
      },
    },
  })

  return {
    totalUsers,
    totalDrafts,
    totalGamesPlayed,
    activeUsers24h,
    draftsToday,
    users: users.map(user => ({
      id: user.id,
      username: user.username,
      email: user.email,
      createdAt: user.createdAt.toISOString(),
      lastActiveTimestamp: user.lastActiveTimestamp,
      totalDrafts: user.createdSeries.length,
      totalGames: user.createdSeries.reduce(
        (acc, series) => acc + series._count.games,
        0,
      ),
    })),
    recentDrafts: recentDrafts.map(draft => ({
      id: draft.id,
      createdAt: draft.createdAt.toISOString(),
      team1Name: draft.team1Name,
      team2Name: draft.team2Name,
      format: draft.format,
      status: draft.status,
      fearlessDraft: draft.fearlessDraft,
      scrimBlock: draft.scrimBlock,
      team1AuthToken: draft.team1AuthToken,
      team2AuthToken: draft.team2AuthToken,
      creator: draft.creator,
    })),
  }
}) satisfies GetAdminStats

export const getReports = (async (args: ReportsArgs, context: any) => {
  if (!context.user?.isAdmin) {
    throw new HttpError(401, 'Unauthorized: Admin access required')
  }

  const { page = 1, perPage = 10 } = args

  const reports = await context.entities.Report.findMany({
    skip: (page - 1) * perPage,
    take: perPage,
    orderBy: {
      createdAt: 'desc',
    },
    include: {
      series: {
        select: {
          id: true,
          team1Name: true,
          team2Name: true,
          format: true,
          status: true,
          createdAt: true,
        },
      },
      reporter: {
        select: {
          id: true,
          username: true,
          email: true,
        },
      },
      reviewedBy: {
        select: {
          id: true,
          username: true,
          email: true,
        },
      },
    },
  })

  const totalReports = await context.entities.Report.count()

  return {
    reports,
    totalReports,
    page,
    perPage,
  }
}) satisfies GetReports

export const triggerChampionUpdate: TriggerChampionUpdate = async (
  args,
  context,
) => {
  if (!context.user?.isAdmin) {
    throw new Error('Unauthorized')
  }

  try {
    await fetchChampionsJob.submit({})
    return { success: true }
  } catch (error) {
    console.error('Failed to trigger champion update:', error)
    throw new Error('Failed to trigger champion update')
  }
}

export const triggerChampionImageUpdate: TriggerChampionImageUpdate = async (
  args,
  context,
) => {
  if (!context.user?.isAdmin) {
    throw new Error('Unauthorized')
  }

  try {
    await fetchChampionImagesJob.submit({})
    return { success: true }
  } catch (error) {
    console.error('Failed to trigger champion image update:', error)
    throw new Error('Failed to trigger champion image update')
  }
}

export const updateReport: UpdateReport = async (args, context) => {
  if (!context.user?.isAdmin) {
    throw new HttpError(401, 'Unauthorized: Admin access required')
  }

  const { reportId, status, reviewNote } = args

  // Find the report first
  const report = await context.entities.Report.findUnique({
    where: { id: reportId },
    include: { series: true },
  })

  if (!report) {
    throw new HttpError(404, 'Report not found')
  }

  // Update the series if the status is BLOCKED
  console.log('Updating report status:', {
    newStatus: status,
    currentStatus: report.status,
  })

  if (status === 'BLOCKED') {
    console.log('Setting series to blocked:', report.seriesId)
    await context.entities.Series.update({
      where: { id: report.seriesId },
      data: { isBlocked: true },
    })
  } else if (report.status === 'BLOCKED' && status !== 'BLOCKED') {
    console.log('Un-blocking series:', report.seriesId)
    await context.entities.Series.update({
      where: { id: report.seriesId },
      data: { isBlocked: false },
    })
  }

  // Update the report
  const updatedReport = await context.entities.Report.update({
    where: { id: reportId },
    data: {
      status,
      reviewNote,
      reviewedBy: { connect: { id: context.user.id } },
      reviewedAt: new Date(),
    },
    include: {
      series: true,
    },
  })

  console.log('Updated report:', {
    reportId: updatedReport.id,
    status: updatedReport.status,
    seriesId: updatedReport.series.id,
    isBlocked: updatedReport.series.isBlocked,
  })

  return updatedReport
}

export type GetAdminStatsResponse = Awaited<ReturnType<typeof getAdminStats>>
export type GetReportsResponse = Awaited<ReturnType<typeof getReports>>
