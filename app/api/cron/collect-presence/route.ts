import { NextRequest, NextResponse } from 'next/server'
import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

export async function POST(request: NextRequest) {
  try {
    // Verify the request is from Vercel Cron by checking for Vercel-specific headers
    const cronHeader = request.headers.get('x-vercel-cron')
    if (!cronHeader) {
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
          // Enhanced presence logic to handle cached data better
          let actualStatus = presenceData.presence === 'active' ? 'active' : 'away'
          
          // If user shows as active but has auto_away or very old last_activity, treat as away
          if (presenceData.presence === 'active' && presenceData.auto_away) {
            actualStatus = 'away'
          }
          
          // If last_activity is very old (>10 minutes), likely away regardless of reported status
          if (presenceData.last_activity) {
            const lastActivityTime = new Date(presenceData.last_activity * 1000)
            const tenMinutesAgo = new Date(Date.now() - 10 * 60 * 1000)
            if (lastActivityTime < tenMinutesAgo && presenceData.presence === 'active') {
              actualStatus = 'away'
            }
          }
          
          // Store presence data
          await prisma.presenceLog.create({
            data: {
              userId: user.id,
              status: actualStatus,
              timestamp: new Date(),
              metadata: JSON.stringify({
                auto_away: presenceData.auto_away,
                manual_away: presenceData.manual_away,
                connection_count: presenceData.connection_count,
                last_activity: presenceData.last_activity,
                raw_presence: presenceData.presence, // Store original for debugging
                adjusted_status: actualStatus !== presenceData.presence
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