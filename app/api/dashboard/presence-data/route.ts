import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { format } from 'date-fns'

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

interface WorkdayData {
  date: string
  dayName: string
  dayShort: string
  timeline: PresenceBlock[]
  messageCount: number
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
  workdays: WorkdayData[]
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const startParam = searchParams.get('start')
  const endParam = searchParams.get('end')
  
  try {
    const startTime = Date.now()
    
    // Calculate date boundaries - use provided dates or default to UTC today
    let todayStart: Date
    let todayEnd: Date
    
    if (startParam && endParam) {
      todayStart = new Date(startParam)
      todayEnd = new Date(endParam)
    } else {
      const now = new Date()
      todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0)  
      todayEnd = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999)
    }

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

    // Calculate 7-day range for timeline data (selected date + 6 previous days)
    const workdays: Date[] = []
    for (let i = 0; i < 7; i++) {
      const date = new Date(todayStart.getTime() - i * 24 * 60 * 60 * 1000)
      workdays.push(date)
    }

    const oldestWorkday = workdays[workdays.length - 1]
    const timelineRangeStart = new Date(oldestWorkday.getTime())

    // Get additional timeline data (excluding today since we already have it)
    const timelineQueryStart = Date.now()
    const timelinePresenceLogs = await prisma.presenceLog.findMany({
      where: {
        userId: { in: userIds },
        timestamp: {
          gte: timelineRangeStart,
          lt: todayStart, // Exclude today's data to avoid duplicates
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
      take: 40000, // Limit historical data
    })
    console.log(`📊 Timeline data query took ${Date.now() - timelineQueryStart}ms (${timelinePresenceLogs.length} records)`)

    // Combine both datasets
    const allPresenceLogs = [...todayPresenceLogs, ...timelinePresenceLogs]
    console.log(`📊 Total records: ${allPresenceLogs.length}`)

    // Group presence logs by user and date for efficient processing
    const presenceByUserAndDay = new Map<string, Array<{ timestamp: Date, status: string }>>()
    const presenceByUser = new Map<string, Array<{ timestamp: Date, status: string }>>()

    const processingStart = Date.now()
    allPresenceLogs.forEach(log => {
      // For timeline data (grouped by user and day)
      const dateKey = log.timestamp.toISOString().split('T')[0]
      const userDayKey = `${log.userId}-${dateKey}`
      
      if (!presenceByUserAndDay.has(userDayKey)) {
        presenceByUserAndDay.set(userDayKey, [])
      }
      presenceByUserAndDay.get(userDayKey)!.push({
        timestamp: log.timestamp,
        status: log.status
      })

      // For today's data (grouped by user only)
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
      const todayTimeline: PresenceBlock[] = []
      
      for (let hour = 0; hour < 24; hour++) {
        for (let quarter = 0; quarter < 4; quarter++) {
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

      // Generate 7-day timeline data
      const userWorkdays: WorkdayData[] = workdays.map(workday => {
        const dateKey = workday.toISOString().split('T')[0]
        const userDayKey = `${user.id}-${dateKey}`
        const dayPresenceLogs = presenceByUserAndDay.get(userDayKey) || []
        
        const dayStart = new Date(workday.getTime())
        const dayTimeline: PresenceBlock[] = []
        
        for (let hour = 0; hour < 24; hour++) {
          for (let quarter = 0; quarter < 4; quarter++) {
            const blockStart = new Date(dayStart.getTime() + (hour * 60 + quarter * 15) * 60 * 1000)
            const blockEnd = new Date(blockStart.getTime() + 15 * 60 * 1000)
            
            const blockLogs = dayPresenceLogs.filter(log => 
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
            
            dayTimeline.push({
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
        
        return {
          date: dateKey,
          dayName: format(workday, 'EEEE'),
          dayShort: format(workday, 'EEE'),
          timeline: dayTimeline,
          messageCount: 0,
        }
      })

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
        workdays: userWorkdays,
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