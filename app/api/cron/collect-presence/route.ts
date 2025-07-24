import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'

export async function GET(request: NextRequest) {
  const startTime = Date.now()
  const requestId = Math.random().toString(36).substring(7)
  
  console.log(`[${requestId}] 🚀 Starting presence collection job at ${new Date().toISOString()}`)
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

    console.log(`[${requestId}] ✅ Authentication successful, proceeding with presence collection`)
    
    // Test database connection first
    console.log(`[${requestId}] 🔌 Testing database connection...`)
    try {
      await prisma.$connect()
      console.log(`[${requestId}] ✅ Database connection successful`)
    } catch (dbError) {
      console.error(`[${requestId}] ❌ Database connection failed:`, dbError)
      return NextResponse.json({ error: 'Database connection failed', details: dbError.message }, { status: 500 })
    }

    // Get one user with a valid bot token to check all users' presence
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
    console.log(`[${requestId}] 🔑 Using token type for presence:`, botToken ? 'bot' : 'user')

    // Get all active users (not just those with tokens)
    console.log(`[${requestId}] 👥 Fetching all active users...`)
    const users = await prisma.user.findMany({
      where: {
        // Exclude users marked as inactive
        OR: [
          { metadata: null },
          { metadata: { not: { contains: '"inactive":true' } } }
        ]
      }
    })
    console.log(`[${requestId}] ✅ Found ${users.length} users to monitor:`, users.map(u => u.name || u.slackUserId).join(', '))

    // First, fetch all presence data from Slack API without holding DB connections
    console.log(`[${requestId}] 📡 Fetching presence data from Slack API for ${users.length} users...`)
    const presencePromises = users.map(async (user, index) => {
      try {
        console.log(`[${requestId}] 📞 API call ${index + 1}/${users.length}: Fetching presence for ${user.name || user.slackUserId}`)
        
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

        if (!presenceResponse.ok) {
          console.error(`[${requestId}] ❌ HTTP error for user ${user.name || user.slackUserId}: ${presenceResponse.status} ${presenceResponse.statusText}`)
          return { user, error: `HTTP ${presenceResponse.status}`, success: false }
        }

        const presenceData = await presenceResponse.json()
        console.log(`[${requestId}] 📊 API response for ${user.name || user.slackUserId}:`, {
          ok: presenceData.ok,
          presence: presenceData.presence,
          error: presenceData.error,
          warning: presenceData.warning
        })
        
        return { user, presenceData, success: presenceData.ok }
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error)
        console.error(`[${requestId}] ❌ Error fetching presence for user ${user.id}: ${errorMessage}`)
        return { user, error: errorMessage, success: false }
      }
    })

    // Wait for all Slack API calls to complete
    console.log(`[${requestId}] ⏳ Waiting for all ${users.length} Slack API calls to complete...`)
    const presenceResults = await Promise.all(presencePromises)
    console.log(`[${requestId}] ✅ All Slack API calls completed`)

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
      console.log(`[${requestId}] 💾 Attempting to insert ${presenceLogData.length} presence logs to database...`)
      console.log(`[${requestId}] 📝 Sample data structure:`, JSON.stringify(presenceLogData[0], null, 2))
      
      try {
        const insertResult = await prisma.presenceLog.createMany({
          data: presenceLogData,
          skipDuplicates: true
        })
        console.log(`[${requestId}] ✅ Successfully inserted ${insertResult.count} presence logs out of ${presenceLogData.length} prepared`)
        
        if (insertResult.count < presenceLogData.length) {
          console.warn(`[${requestId}] ⚠️ Some records were skipped: ${presenceLogData.length - insertResult.count} duplicates or constraint violations`)
        }
      } catch (error) {
        console.error(`[${requestId}] ❌ Database insert failed:`, {
          error: error.message,
          code: error.code,
          meta: error.meta,
          stack: error.stack
        })
        console.error(`[${requestId}] 📋 Failed presence data sample:`, JSON.stringify(presenceLogData[0], null, 2))
        console.error(`[${requestId}] 📋 All failed data:`, JSON.stringify(presenceLogData, null, 2))
      }
    } else {
      console.warn(`[${requestId}] ⚠️ No presence data to insert`)
    }

    const successCount = results.filter(r => r.success).length
    const errorCount = results.filter(r => !r.success).length
    const duration = Date.now() - startTime

    console.log(`[${requestId}] 🎉 Presence collection completed in ${duration}ms: ${successCount} successful, ${errorCount} errors`)
    
    // Log any errors for debugging
    if (errorCount > 0) {
      const errorDetails = results.filter(r => !r.success).map(r => ({
        userId: r.userId,
        error: r.error
      }))
      console.log(`[${requestId}] ❌ Error details:`, errorDetails)
    }

    return NextResponse.json({
      message: 'Presence collection completed',
      requestId,
      results: {
        total: users.length,
        successful: successCount,
        errors: errorCount,
        duration: `${duration}ms`
      },
      timestamp: new Date().toISOString()
    })

  } catch (error) {
    const duration = Date.now() - startTime
    const errorMessage = error instanceof Error ? error.message : String(error)
    console.error(`[${requestId}] ❌ Critical error in presence collection job after ${duration}ms:`, {
      error: errorMessage,
      stack: error.stack,
      name: error.name
    })
    return NextResponse.json({ 
      error: 'Internal server error',
      requestId,
      details: errorMessage,
      duration: `${duration}ms`
    }, { status: 500 })
  }
}