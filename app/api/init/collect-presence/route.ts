import { NextResponse } from 'next/server'
import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

export async function POST() {
  try {
    console.log('Starting initialization presence collection...')
    
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
          
          // Store presence data
          await prisma.presenceLog.create({
            data: {
              userId: user.id,
              status: actualStatus,
              timestamp: new Date(),
              metadata: JSON.stringify({
                online: presenceData.online,
                auto_away: presenceData.auto_away,
                manual_away: presenceData.manual_away,
                connection_count: presenceData.connection_count,
                last_activity: presenceData.last_activity,
                raw_presence: presenceData.presence // Store original for reference
              })
            }
          })

          results.push({
            userId: user.id,
            status: presenceData.presence,
            success: true
          })
        } else {
          console.error(`Failed to get presence for user ${user.id} (${user.name || user.slackUserId}): Slack API error - ${presenceData.error}`)
          results.push({
            userId: user.id,
            error: presenceData.error,
            success: false
          })
        }
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error)
        console.error(`Error processing user ${user.id} (${user.name || user.slackUserId}): ${errorMessage}`)
        results.push({
          userId: user.id,
          error: errorMessage,
          success: false
        })
      }
    }

    const successCount = results.filter(r => r.success).length
    const errorCount = results.filter(r => !r.success).length

    console.log(`Initialization presence collection completed: ${successCount} successful, ${errorCount} errors`)

    return NextResponse.json({
      message: 'Initialization presence collection completed',
      results: {
        total: users.length,
        successful: successCount,
        errors: errorCount
      },
      timestamp: new Date().toISOString()
    })

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error)
    console.error('Error in initialization presence collection:', error)
    return NextResponse.json({ 
      error: 'Initialization presence collection failed',
      details: errorMessage 
    }, { status: 500 })
  }
}