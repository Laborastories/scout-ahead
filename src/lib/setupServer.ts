import { fetchChampionsJob } from 'wasp/server/jobs'
import { type ServerSetupFn } from 'wasp/server'
import { pgBossStarted } from 'wasp/server/jobs/core/pgBoss/pgBoss'

export const setupServer: ServerSetupFn = async () => {
  // TEMPORARY: Clear all queued jobs
  try {
    const pgBoss = await pgBossStarted
    console.log('🧹 Cleaning up all job queues...')
    await pgBoss.deleteAllQueues()
    console.log('✅ Cleaned up all queues')
  } catch (error) {
    console.error('❌ Failed to clean up jobs:', error)
  }

  // Run fetchChampions job on startup
  try {
    await fetchChampionsJob.submit({})
    console.log('✅ Submitted fetchChampions job')
  } catch (error) {
    console.error('❌ Failed to submit fetchChampions job:', error)
  }
}
