import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'

interface PresenceBlock {
  hour: number
  quarter: number
  blockIndex: number
  status: 'online' | 'offline' | 'no-data'
  onlinePercentage: number
  activeMinutes: number
  totalMinutes: number
  messageCount: number
  hasMessages: boolean
  blockStart: string
  blockEnd: string
}


interface UserPresenceData {
  id: string
  name: string | null
  avatarUrl: string | null
  timezone: string | null
  slackUserId: string
  timeline: PresenceBlock[]
  totalActiveMinutes: number
  messageCount: number
  isCurrentlyOnline: boolean
  lastActiveTime: string | null
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const startParam = searchParams.get('start')
  const endParam = searchParams.get('end')
  
  try {
    const startTime = Date.now()
    
    // Calculate date boundaries - use provided dates or default to current date range
    let todayStart: Date
    let todayEnd: Date
    
    if (startParam && endParam) {
      todayStart = new Date(startParam)
      todayEnd = new Date(endParam)
      
      // Ensure we include current time if the range includes today
      const now = new Date()
      if (now > todayEnd) {
        // Extend the end time to include current time
        todayEnd = new Date(now.getTime() + 60 * 60 * 1000) // Add 1 hour buffer
      }
    } else {
      // Default to a 24-hour window that includes current time
      const now = new Date()
      todayStart = new Date(now.getTime() - 24 * 60 * 60 * 1000) // 24 hours ago
      todayEnd = new Date(now.getTime() + 60 * 60 * 1000) // 1 hour from now
    }
    
    console.log(`📊 Date range: ${todayStart.toISOString()} to ${todayEnd.toISOString()}`)

    // Get all active users
    const users = await prisma.user.findMany({
      where: {
        OR: [
          { metadata: null },
          { metadata: { not: { contains: '"inactive":true' } } }
        ]
      },
      select: {
        id: true,
        name: true,
        avatarUrl: true,
        timezone: true,
        slackUserId: true,
      },
    })

    if (users.length === 0) {
      return NextResponse.json({
        success: true,
        data: []
      })
    }

    const userIds = users.map(u => u.id)
    console.log(`📊 Starting presence data fetch for ${userIds.length} users`)

    // First, get today's data only (faster query)
    const queryStart = Date.now()
    const todayPresenceLogs = await prisma.presenceLog.findMany({
      where: {
        userId: { in: userIds },
        timestamp: {
          gte: todayStart,
          lte: todayEnd,
        },
      },
      select: {
        userId: true,
        status: true,
        timestamp: true,
      },
      orderBy: [
        { userId: 'asc' },
        { timestamp: 'asc' }
      ],
    })
    console.log(`📊 Today's data query took ${Date.now() - queryStart}ms (${todayPresenceLogs.length} records)`)

    console.log(`📊 Total records: ${todayPresenceLogs.length}`)

    // Group presence logs by user for efficient processing
    const presenceByUser = new Map<string, Array<{ timestamp: Date, status: string }>>()

    const processingStart = Date.now()
    todayPresenceLogs.forEach(log => {
      if (!presenceByUser.has(log.userId)) {
        presenceByUser.set(log.userId, [])
      }
      presenceByUser.get(log.userId)!.push({
        timestamp: log.timestamp,
        status: log.status
      })
    })
    console.log(`📊 Data grouping took ${Date.now() - processingStart}ms`)

    // Process data for each user
    const userData: UserPresenceData[] = users.map(user => {
      const userPresenceLogs = presenceByUser.get(user.id) || []
      
      // Today's timeline data
      const todayLogs = userPresenceLogs.filter(log => 
        log.timestamp >= todayStart && log.timestamp <= todayEnd
      )

      // Check if user is currently online (last 15 minutes)
      const fifteenMinutesAgo = new Date(Date.now() - 15 * 60 * 1000)
      const recentLogs = todayLogs.filter(log => log.timestamp >= fifteenMinutesAgo)
      const mostRecentLog = recentLogs.length > 0 ? recentLogs[recentLogs.length - 1] : null
      const isCurrentlyOnline = mostRecentLog?.status === 'active'

      // Find last active time
      const allActiveLogs = todayLogs.filter(log => log.status === 'active')
      const lastActiveTime = allActiveLogs.length > 0 
        ? allActiveLogs[allActiveLogs.length - 1].timestamp 
        : null

      // Generate today's timeline (96 15-minute blocks) 
      // Create blocks aligned to clean 15-minute boundaries for the selected day
      // The todayStart already represents the correct local time boundaries from the client
      
      const todayTimeline: PresenceBlock[] = []
      
      for (let hour = 0; hour < 24; hour++) {
        for (let quarter = 0; quarter < 4; quarter++) {
          // Calculate block boundaries directly from todayStart which preserves the client's timezone intent
          const blockStart = new Date(todayStart.getTime() + (hour * 60 + quarter * 15) * 60 * 1000)
          const blockEnd = new Date(blockStart.getTime() + 15 * 60 * 1000)
          
          const blockLogs = todayLogs.filter(log => 
            log.timestamp >= blockStart && log.timestamp < blockEnd
          )
          
          const activeMinutes = blockLogs.filter(log => log.status === 'active').length
          const onlinePercentage = Math.round((activeMinutes / 15) * 100)
          
          let status: 'online' | 'offline' | 'no-data'
          if (blockLogs.length === 0) {
            status = 'no-data'
          } else if (activeMinutes > 0) {
            status = 'online'
          } else {
            status = 'offline'
          }
          
          todayTimeline.push({
            hour,
            quarter,
            blockIndex: hour * 4 + quarter,
            status,
            onlinePercentage,
            activeMinutes,
            totalMinutes: 15,
            messageCount: 0,
            hasMessages: false,
            blockStart: blockStart.toISOString(),
            blockEnd: blockEnd.toISOString(),
          })
        }
      }


      // Calculate total active minutes for today
      const totalActiveMinutes = todayTimeline.reduce((sum, block) => sum + block.activeMinutes, 0)

      return {
        id: user.id,
        name: user.name,
        avatarUrl: user.avatarUrl,
        timezone: user.timezone,
        slackUserId: user.slackUserId,
        timeline: todayTimeline,
        totalActiveMinutes,
        messageCount: 0,
        isCurrentlyOnline,
        lastActiveTime: lastActiveTime?.toISOString() || null,
      }
    })

    console.log(`📊 Total API processing time: ${Date.now() - startTime}ms`)

    const response = NextResponse.json({
      success: true,
      data: userData,
    })
    
    // Cache for 30 seconds with stale-while-revalidate
    response.headers.set('Cache-Control', 'public, max-age=30, stale-while-revalidate=60')
    
    return response

  } catch (error) {
    console.error('Error fetching presence data:', error)
    return NextResponse.json(
      { error: 'Failed to fetch presence data' },
      { status: 500 }
    )
  }
}