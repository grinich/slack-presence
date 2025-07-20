import { NextRequest, NextResponse } from 'next/server'
import { PrismaClient } from '@prisma/client'

interface SlackMember {
  id: string
  deleted?: boolean
  is_restricted?: boolean
  is_ultra_restricted?: boolean
  is_bot?: boolean
  real_name?: string
  name?: string
  profile?: {
    email?: string
    image_192?: string
    display_name?: string
    status_text?: string
    status_emoji?: string
    title?: string
  }
  tz?: string
  is_admin?: boolean
  is_owner?: boolean
}

interface SlackUsersResponse {
  ok: boolean
  members: SlackMember[]
  error?: string
}

const prisma = new PrismaClient()

export async function GET(request: NextRequest) {
  try {
    // Verify the request is from Vercel Cron by checking Authorization header
    const authHeader = request.headers.get('authorization')
    if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
      return NextResponse.json({ error: 'Unauthorized - not from Vercel cron' }, { status: 401 })
    }

    console.log('Starting company-wide user sync...')
    
    // Get one user with a valid bot token to fetch team members
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
    console.log('Using token type:', botToken ? 'bot' : 'user')

    // Fetch all team members
    const usersResponse = await fetch('https://slack.com/api/users.list', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      }
    })

    const usersData: SlackUsersResponse = await usersResponse.json()

    if (!usersData.ok) {
      console.error('Failed to fetch team members:', usersData.error)
      return NextResponse.json({ error: `Slack API error: ${usersData.error}` }, { status: 400 })
    }

    console.log(`Found ${usersData.members.length} team members`)

    const results = []
    for (const member of usersData.members) {
      // Skip deleted users, bots (except our app), system users, and inactive accounts
      if (member.deleted || 
          member.is_restricted || 
          member.is_ultra_restricted ||
          (member.is_bot && member.name !== 'team analytics') || 
          member.id === 'USLACKBOT') {
        console.log(`Skipping inactive user: ${member.name || member.id} (deleted: ${member.deleted}, restricted: ${member.is_restricted}, ultra_restricted: ${member.is_ultra_restricted}, bot: ${member.is_bot})`)
        continue
      }

      try {
        // Check if user exists in our database
        const existingUser = await prisma.user.findUnique({
          where: { slackUserId: member.id }
        })

        const userData = {
          slackUserId: member.id,
          name: member.real_name || member.name || 'Unknown',
          email: member.profile?.email || '',
          avatarUrl: member.profile?.image_192 || '',
          timezone: member.tz || null,
          slackTeamId: adminUser.slackTeamId,
          metadata: JSON.stringify({
            profile: {
              display_name: member.profile?.display_name,
              status_text: member.profile?.status_text,
              status_emoji: member.profile?.status_emoji,
              title: member.profile?.title
            },
            is_admin: member.is_admin,
            is_owner: member.is_owner,
            syncedAt: new Date().toISOString(),
            // Remove inactive flag for active users
            inactive: false
          })
        }

        if (existingUser) {
          // Update existing user (but preserve access token if they have one)
          await prisma.user.update({
            where: { id: existingUser.id },
            data: {
              name: userData.name,
              email: userData.email || existingUser.email,
              avatarUrl: userData.avatarUrl || existingUser.avatarUrl,
              timezone: userData.timezone || existingUser.timezone,
              metadata: userData.metadata
            }
          })
          results.push({ userId: existingUser.id, action: 'updated', name: userData.name, timezone: userData.timezone })
        } else {
          // Create new user (without access token - they'll need to sign in to get presence monitoring)
          const newUser = await prisma.user.create({
            data: userData
          })
          results.push({ userId: newUser.id, action: 'created', name: userData.name, timezone: userData.timezone })
        }

        console.log(`${existingUser ? 'Updated' : 'Created'} user: ${userData.name} (${userData.timezone || 'no timezone'})`)

      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error)
        console.error(`Error processing user ${member.name} (${member.id}):`, error)
        results.push({ userId: member.id, action: 'error', error: errorMessage })
      }
    }

    // Clean up users who are no longer in the Slack workspace
    const activeSlackUserIds = usersData.members
      .filter((member: SlackMember) => !member.deleted && !member.is_restricted && !member.is_ultra_restricted && !member.is_bot)
      .map((member: SlackMember) => member.id)
    
    const inactiveUsers = await prisma.user.findMany({
      where: {
        slackUserId: { notIn: activeSlackUserIds },
        slackTeamId: adminUser.slackTeamId
      }
    })

    // Mark inactive users (don't delete, in case they come back)
    for (const inactiveUser of inactiveUsers) {
      await prisma.user.update({
        where: { id: inactiveUser.id },
        data: {
          metadata: JSON.stringify({
            ...(inactiveUser.metadata ? JSON.parse(inactiveUser.metadata) : {}),
            inactive: true,
            inactiveSince: new Date().toISOString()
          })
        }
      })
      console.log(`Marked user as inactive: ${inactiveUser.name} (${inactiveUser.slackUserId})`)
    }

    const created = results.filter(r => r.action === 'created').length
    const updated = results.filter(r => r.action === 'updated').length
    const errors = results.filter(r => r.action === 'error').length

    console.log(`Company-wide sync completed: ${created} created, ${updated} updated, ${errors} errors, ${inactiveUsers.length} marked inactive`)

    return NextResponse.json({
      message: 'Company-wide user sync completed',
      results: {
        total: results.length,
        created,
        updated,
        errors,
        markedInactive: inactiveUsers.length
      },
      timestamp: new Date().toISOString()
    })

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error)
    console.error('Error in company-wide user sync:', error)
    return NextResponse.json({ 
      error: 'Company-wide sync failed',
      details: errorMessage 
    }, { status: 500 })
  }
}