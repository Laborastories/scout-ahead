import { HttpError } from 'wasp/server'
import { type Report } from 'wasp/entities'
import { type CreateReport } from 'wasp/server/operations'

type CreateReportArgs = {
  seriesId: string
  reason: string
  details?: string
}

// Use the generated CreateReport type from wasp/server/operations
export const createReport: CreateReport<CreateReportArgs, Report> = async (
  args,
  context,
) => {
  const { seriesId, reason, details } = args

  // Check if series exists
  const series = await context.entities.Series.findUnique({
    where: { id: seriesId },
  })

  if (!series) {
    throw new HttpError(404, 'Series not found')
  }

  // Create the report
  const report = await context.entities.Report.create({
    data: {
      seriesId,
      reason,
      details,
      // If user is logged in, associate them as the reporter
      ...(context.user && {
        reporterId: context.user.id,
      }),
      status: 'PENDING',
    },
  })

  return report
}
