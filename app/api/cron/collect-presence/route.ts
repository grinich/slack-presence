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

    const results = []
    for (const user of users) {
      try {
        // Get user's presence from Slack API using bot/admin token
        // Note: This may return cached data - consider implementing RTM API for real-time updates
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

        if (presenceData.ok) {
          // Simple presence logic - just use the presence field directly
          const actualStatus = presenceData.presence === 'active' ? 'active' : 'away'
          
          console.log(`🟢 Presence check for ${user.name || user.slackUserId}: ${JSON.stringify({
            presence: presenceData.presence,
            online: presenceData.online,
            auto_away: presenceData.auto_away,
            manual_away: presenceData.manual_away,
            connection_count: presenceData.connection_count,
            last_activity: presenceData.last_activity,
            actualStatus
          })}`)
          
          // Store presence data
          await prisma.presenceLog.create({
            data: {
              userId: user.id,
              status: actualStatus,
              timestamp: new Date(),
              metadata: JSON.stringify({
                online: presenceData.online ?? null,
                auto_away: presenceData.auto_away ?? null,
                manual_away: presenceData.manual_away ?? null,
                connection_count: presenceData.connection_count ?? null,
                last_activity: presenceData.last_activity ?? null,
                raw_presence: presenceData.presence ?? null,
                // Store the complete raw response for debugging
                full_response: presenceData
              })
            }
          })

          // User info updates are now handled by the hourly sync-all-users job

          results.push({
            userId: user.id,
            status: presenceData.presence,
            success: true
          })
        } else {
          console.error(`Failed to get presence for user ${user.id} (${user.name || user.slackUserId}): Slack API error - ${presenceData.error} (HTTP ${presenceResponse.status}). Response: ${JSON.stringify(presenceData)}`)
          results.push({
            userId: user.id,
            error: presenceData.error,
            success: false
          })
        }
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error)
        const errorDetails = error instanceof Error ? { stack: error.stack, name: error.name } : {}
        console.error(`Error processing user ${user.id} (${user.name || user.slackUserId}): Network/parsing error - ${errorMessage} (Error details: ${JSON.stringify(errorDetails)})`)
        results.push({
          userId: user.id,
          error: errorMessage,
          success: false
        })
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