import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'

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

export async function GET(request: NextRequest) {
  const startTime = Date.now()
  const requestId = Math.random().toString(36).substring(7)
  
  console.log(`[${requestId}] 🚀 Starting company-wide user sync at ${new Date().toISOString()}`)
  console.log(`[${requestId}] Environment check:`, {
    nodeEnv: process.env.NODE_ENV,
    hasCronSecret: !!process.env.CRON_SECRET,
    hasDbUrl: !!process.env.DATABASE_URL,
    userAgent: request.headers.get('user-agent'),
    forwardedFor: request.headers.get('x-forwarded-for')
  })

  try {
    // Enhanced cron authentication security
    if (!process.env.CRON_SECRET || process.env.CRON_SECRET.length < 32) {
      console.error(`[${requestId}] ❌ Invalid cron configuration - secret too short or missing`)
      return NextResponse.json({ error: 'Invalid cron configuration' }, { status: 500 })
    }

    const authHeader = request.headers.get('authorization')
    if (!authHeader || authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
      console.warn(`[${requestId}] ⚠️ Unauthorized cron attempt from:`, request.headers.get('x-forwarded-for') || 'unknown')
      return NextResponse.json({ error: 'Unauthorized - not from Vercel cron' }, { status: 401 })
    }

    console.log(`[${requestId}] ✅ Authentication successful, proceeding with user sync`)
    
    // Test database connection first
    console.log(`[${requestId}] 🔌 Testing database connection...`)
    try {
      await prisma.$connect()
      console.log(`[${requestId}] ✅ Database connection successful`)
    } catch (dbError) {
      console.error(`[${requestId}] ❌ Database connection failed:`, dbError)
      const errorMessage = dbError instanceof Error ? dbError.message : String(dbError)
      return NextResponse.json({ error: 'Database connection failed', details: errorMessage }, { status: 500 })
    }

    // Get one user with a valid bot token to fetch team members
    console.log(`[${requestId}] 👤 Looking for admin user with access token...`)
    const adminUser = await prisma.user.findFirst({
      where: {
        slackAccessToken: { not: null }
      }
    })

    if (!adminUser) {
      console.error(`[${requestId}] ❌ No authenticated users found in database`)
      return NextResponse.json({ error: 'No authenticated users found' }, { status: 400 })
    }
    
    console.log(`[${requestId}] ✅ Found admin user: ${adminUser.name || adminUser.slackUserId}`)

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
    console.log(`[${requestId}] 🔑 Using token type:`, botToken ? 'bot' : 'user')

    // Fetch all team members
    console.log(`[${requestId}] 📡 Fetching team members from Slack API...`)
    const usersResponse = await fetch('https://slack.com/api/users.list', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      }
    })

    if (!usersResponse.ok) {
      console.error(`[${requestId}] ❌ HTTP error from Slack API: ${usersResponse.status} ${usersResponse.statusText}`)
      return NextResponse.json({ error: `HTTP error: ${usersResponse.status}` }, { status: 500 })
    }

    const usersData: SlackUsersResponse = await usersResponse.json()

    if (!usersData.ok) {
      console.error(`[${requestId}] ❌ Failed to fetch team members:`, usersData.error)
      return NextResponse.json({ error: `Slack API error: ${usersData.error}` }, { status: 400 })
    }

    console.log(`[${requestId}] ✅ Found ${usersData.members.length} team members from Slack`)

    // Filter active users first to reduce noise in logs
    const activeMembers = usersData.members.filter(member => {
      const shouldSkip = member.deleted || 
          member.is_restricted || 
          member.is_ultra_restricted ||
          (member.is_bot && member.name !== 'team analytics') || 
          member.id === 'USLACKBOT'
      
      return !shouldSkip
    })

    console.log(`Processing ${activeMembers.length} active users (skipped ${usersData.members.length - activeMembers.length} inactive users)`)

    // Process users in batches to avoid overwhelming the database connection pool
    const batchSize = 5
    const results = []
    
    for (let i = 0; i < activeMembers.length; i += batchSize) {
      const batch = activeMembers.slice(i, i + batchSize)
      console.log(`Processing batch ${Math.floor(i / batchSize) + 1}/${Math.ceil(activeMembers.length / batchSize)}`)
      
      const batchPromises = batch.map(async (member) => {
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
          console.log(`Updated user: ${userData.name} (${userData.timezone || 'no timezone'})`)
          return { userId: existingUser.id, action: 'updated', name: userData.name, timezone: userData.timezone }
        } else {
          // Create new user (without access token - they'll need to sign in to get presence monitoring)
          const newUser = await prisma.user.create({
            data: userData
          })
          console.log(`Created user: ${userData.name} (${userData.timezone || 'no timezone'})`)
          return { userId: newUser.id, action: 'created', name: userData.name, timezone: userData.timezone }
        }

        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : String(error)
          console.error(`Error processing user ${member.name} (${member.id}):`, error)
          return { userId: member.id, action: 'error', error: errorMessage }
        }
      })

      // Wait for this batch to complete before moving to the next
      const batchResults = await Promise.all(batchPromises)
      results.push(...batchResults)
    }

    // Clean up users who are no longer in the Slack workspace
    const activeSlackUserIds = activeMembers.map(member => member.id)
    
    const inactiveUsers = await prisma.user.findMany({
      where: {
        slackUserId: { notIn: activeSlackUserIds },
        slackTeamId: adminUser.slackTeamId
      }
    })

    // Mark inactive users in parallel (don't delete, in case they come back)
    const inactiveUserPromises = inactiveUsers.map(async (inactiveUser) => {
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
    })

    if (inactiveUserPromises.length > 0) {
      await Promise.all(inactiveUserPromises)
    }

    const created = results.filter(r => r.action === 'created').length
    const updated = results.filter(r => r.action === 'updated').length
    const errors = results.filter(r => r.action === 'error').length
    const duration = Date.now() - startTime

    console.log(`[${requestId}] 🎉 Company-wide sync completed in ${duration}ms: ${created} created, ${updated} updated, ${errors} errors, ${inactiveUsers.length} marked inactive`)
    
    // Log any errors for debugging
    if (errors > 0) {
      const errorDetails = results.filter(r => r.action === 'error').map(r => ({
        userId: r.userId,
        error: r.error
      }))
      console.log(`[${requestId}] ❌ Error details:`, errorDetails)
    }

    return NextResponse.json({
      message: 'Company-wide user sync completed',
      requestId,
      results: {
        total: results.length,
        created,
        updated,
        errors,
        markedInactive: inactiveUsers.length,
        duration: `${duration}ms`
      },
      timestamp: new Date().toISOString()
    })

  } catch (error) {
    const duration = Date.now() - startTime
    const errorMessage = error instanceof Error ? error.message : String(error)
    console.error(`[${requestId}] ❌ Critical error in company-wide user sync after ${duration}ms:`, {
      error: errorMessage,
      stack: error instanceof Error ? error.stack : undefined,
      name: error instanceof Error ? error.name : 'Unknown'
    })
    return NextResponse.json({ 
      error: 'Company-wide sync failed',
      requestId,
      details: errorMessage,
      duration: `${duration}ms`
    }, { status: 500 })
  }
}