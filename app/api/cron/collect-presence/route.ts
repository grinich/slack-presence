import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'

export async function GET(request: NextRequest) {
  try {
    // Enhanced cron authentication security
    if (!process.env.CRON_SECRET || process.env.CRON_SECRET.length < 32) {
      console.error('Invalid cron configuration - secret too short or missing')
      return NextResponse.json({ error: 'Invalid cron configuration' }, { status: 500 })
    }

    const authHeader = request.headers.get('authorization')
    if (!authHeader || authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
      console.warn('Unauthorized cron attempt from:', request.headers.get('x-forwarded-for') || 'unknown')
      return NextResponse.json({ error: 'Unauthorized - not from Vercel cron' }, { status: 401 })
    }

    console.log('Starting presence collection job...')
    
    // Get one user with a valid bot token to check all users' presence
    const adminUser = await prisma.user.findFirst({
      where: {
        slackAccessToken: { not: null }
      }
    })

    if (!adminUser) {
      return NextResponse.json({ error: 'No authenticated users found' }, { status: 400 })
    }

    // Get bot token from user metadata
    let botToken = null
    if (adminUser.metadata) {
      try {
        const metadata = JSON.parse(adminUser.metadata)
        botToken = metadata.botToken
      } catch {
        console.warn('Could not parse user metadata for bot token')
      }
    }

    // Use bot token if available, otherwise use user token
    const token = botToken || adminUser.slackAccessToken
    console.log('Using token type for presence:', botToken ? 'bot' : 'user')

    // Get all active users (not just those with tokens)
    const users = await prisma.user.findMany({
      where: {
        // Exclude users marked as inactive
        OR: [
          { metadata: null },
          { metadata: { not: { contains: '"inactive":true' } } }
        ]
      }
    })
    console.log(`Found ${users.length} users to monitor`)

    // First, fetch all presence data from Slack API without holding DB connections
    const presencePromises = users.map(async (user) => {
      try {
        const presenceResponse = await fetch('https://slack.com/api/users.getPresence', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/x-www-form-urlencoded',
          },
          body: new URLSearchParams({
            user: user.slackUserId
          })
        })

        const presenceData = await presenceResponse.json()
        return { user, presenceData, success: presenceData.ok }
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error)
        console.error(`Error fetching presence for user ${user.id}: ${errorMessage}`)
        return { user, error: errorMessage, success: false }
      }
    })

    // Wait for all Slack API calls to complete
    const presenceResults = await Promise.all(presencePromises)

    // Now batch insert all presence logs to database
    const presenceLogData = []
    const results = []

    for (const result of presenceResults) {
      if (result.success && result.presenceData) {
        const actualStatus = result.presenceData.presence === 'active' ? 'active' : 'away'
        
        console.log(`🟢 Presence check for ${result.user.name || result.user.slackUserId}: ${JSON.stringify({
          presence: result.presenceData.presence,
          online: result.presenceData.online,
          auto_away: result.presenceData.auto_away,
          manual_away: result.presenceData.manual_away,
          connection_count: result.presenceData.connection_count,
          last_activity: result.presenceData.last_activity,
          actualStatus
        })}`)

        presenceLogData.push({
          userId: result.user.id,
          status: actualStatus,
          timestamp: new Date(),
          metadata: JSON.stringify({
            online: result.presenceData.online ?? null,
            auto_away: result.presenceData.auto_away ?? null,
            manual_away: result.presenceData.manual_away ?? null,
            connection_count: result.presenceData.connection_count ?? null,
            last_activity: result.presenceData.last_activity ?? null,
            raw_presence: result.presenceData.presence ?? null,
            full_response: result.presenceData
          })
        })

        results.push({
          userId: result.user.id,
          status: result.presenceData.presence,
          success: true
        })
      } else {
        const error = result.error || result.presenceData?.error || 'Unknown error'
        console.error(`Failed to get presence for user ${result.user.id}: ${error}`)
        results.push({
          userId: result.user.id,
          error,
          success: false
        })
      }
    }

    // Batch insert all presence logs at once
    if (presenceLogData.length > 0) {
      try {
        const insertResult = await prisma.presenceLog.createMany({
          data: presenceLogData,
          skipDuplicates: true
        })
        console.log(`Successfully inserted ${insertResult.count} presence logs out of ${presenceLogData.length} prepared`)
      } catch (error) {
        console.error('Database insert failed:', error)
        console.error('Failed presence data sample:', presenceLogData[0])
      }
    }

    const successCount = results.filter(r => r.success).length
    const errorCount = results.filter(r => !r.success).length

    console.log(`Presence collection completed: ${successCount} successful, ${errorCount} errors`)

    return NextResponse.json({
      message: 'Presence collection completed',
      results: {
        total: users.length,
        successful: successCount,
        errors: errorCount
      },
      timestamp: new Date().toISOString()
    })

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error)
    console.error('Error in presence collection job:', error)
    return NextResponse.json({ 
      error: 'Internal server error',
      details: errorMessage 
    }, { status: 500 })
  }
}