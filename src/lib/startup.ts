import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

// Auto-start message sync for all authenticated users
export async function autoStartMessageSync() {
  try {
    console.log('🚀 Starting automatic message sync on server startup...')
    
    // Get all users with access tokens
    const users = await prisma.user.findMany({
      where: {
        slackAccessToken: {
          not: null
        }
      },
      select: {
        id: true,
        slackUserId: true,
        slackTeamId: true,
        slackAccessToken: true,
        name: true
      }
    })

    console.log(`Found ${users.length} users with Slack tokens`)

    for (const user of users) {
      console.log(`Starting message sync for user: ${user.name || user.slackUserId}`)
      
      // Make a POST request to the sync endpoint
      const response = await fetch('http://localhost:3000/api/sync/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          userId: user.slackUserId,
          teamId: user.slackTeamId,
          accessToken: user.slackAccessToken
        })
      })

      if (response.ok) {
        console.log(`✅ Message sync started for user: ${user.name || user.slackUserId}`)
      } else {
        console.error(`❌ Failed to start message sync for user: ${user.name || user.slackUserId}`)
      }
    }
  } catch (error) {
    console.error('Error in auto-start message sync:', error)
  }
}