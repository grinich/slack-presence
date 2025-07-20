import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { subDays, format, startOfDay, endOfDay } from 'date-fns'

interface PresenceLog {
  id: string
  userId: string
  status: string
  timestamp: Date
  metadata?: string | null
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const userIds = searchParams.get('userIds')?.split(',').filter(id => id.trim()) || []
  
  if (userIds.length === 0) {
    return NextResponse.json({ error: 'No user IDs provided' }, { status: 400 })
  }

  try {
    // Get date range from query parameters for timezone handling
    const startParam = searchParams.get('start')
    
    let baseDate: Date
    if (startParam) {
      baseDate = new Date(startParam) // Client sends UTC date
    } else {
      baseDate = new Date() // Fallback to server UTC today
    }
    
    const workdays = []
    
    // Keep the date in UTC - don't convert to server local timezone
    const userTimezoneToday = new Date(baseDate.getTime())
    
    // Generate last 7 days (including today) - preserve UTC dates like today-overview
    for (let i = 0; i < 7; i++) {
      const date = new Date(userTimezoneToday.getTime() - i * 24 * 60 * 60 * 1000)
      workdays.push(date)
    }
    
    // Get date range for all workdays - use the workday dates directly
    const oldestWorkday = workdays[workdays.length - 1]
    const newestWorkday = workdays[0]
    const rangeStart = new Date(oldestWorkday.getTime())
    const rangeEnd = new Date(newestWorkday.getTime() + 24 * 60 * 60 * 1000 - 1)

    // Batch fetch all presence logs for all users across all workdays
    const allPresenceLogs = await prisma.presenceLog.findMany({
      where: {
        userId: { in: userIds },
        timestamp: {
          gte: rangeStart,
          lte: rangeEnd,
        },
      },
      orderBy: {
        timestamp: 'asc',
      },
    })

    // Messages removed - using presence data only

    // Group presence data by userId for efficient access
    const presenceByUser = new Map()

    allPresenceLogs.forEach(log => {
      if (!presenceByUser.has(log.userId)) {
        presenceByUser.set(log.userId, [])
      }
      presenceByUser.get(log.userId).push(log)
    })

    // Process timeline data for all users
    const timelineData = []
    
    for (const userId of userIds) {
      const userTimeline = []
      const userPresenceLogs = presenceByUser.get(userId) || []
      // Messages removed - using presence data only
      
      for (const workday of workdays) {
        // Use the same approach as today-overview: preserve the client-provided UTC date
        const dayStart = new Date(workday.getTime())
        const dayEnd = new Date(workday.getTime() + 24 * 60 * 60 * 1000 - 1) // End of day
        
        // Filter logs for this specific workday
        const presenceLogs = userPresenceLogs.filter((log: PresenceLog) => 
          log.timestamp >= dayStart && log.timestamp <= dayEnd
        )
        
        const messages = [] // Messages removed - using presence data only
        
        const messageCount = messages.length
        
        // Create 15-minute timeline data (96 blocks per day: 24 hours * 4 blocks)
        const dayTimeline = []
        
        for (let hour = 0; hour < 24; hour++) {
          for (let quarter = 0; quarter < 4; quarter++) {
            // Use the same logic as today-overview API to ensure consistency
            const blockStart = new Date(dayStart.getTime() + (hour * 60 + quarter * 15) * 60 * 1000)
            const blockEnd = new Date(blockStart.getTime() + 15 * 60 * 1000)
            
            // Find logs within this 15-minute block
            const blockLogs = presenceLogs.filter((log: PresenceLog) => 
              log.timestamp >= blockStart && log.timestamp <= blockEnd
            )
            
            const blockMessages = [] // Messages removed - using presence data only
            
            // Calculate online percentage for this 15-minute block
            const activeMinutes = blockLogs.filter((log: PresenceLog) => log.status === 'active').length
            const totalMinutesInBlock = 15 // Each block is 15 minutes
            const totalMinutesWithData = blockLogs.length
            const presencePercentage = totalMinutesWithData > 0 ? (activeMinutes / totalMinutesWithData) * 100 : 0
            
            const hasMessages = false // Messages removed - using presence data only
            
            // Determine status based on presence activity only
            let status = 'no-data'
            let onlinePercentage = presencePercentage
            
            if (totalMinutesWithData > 0) {
              // Use presence data
              status = presencePercentage >= 50 ? 'online' : 'offline'
              onlinePercentage = presencePercentage
            }
            
            dayTimeline.push({
              hour,
              quarter,
              blockIndex: hour * 4 + quarter,
              status,
              onlinePercentage: Math.round(onlinePercentage),
              activeMinutes,
              totalMinutes: totalMinutesInBlock, // Always 15 minutes
              totalMinutesWithData: totalMinutesWithData, // Actual presence logs
              messageCount: blockMessages.length,
              hasMessages,
              blockStart: blockStart.toISOString(),
              blockEnd: blockEnd.toISOString(),
            })
          }
        }
        
        userTimeline.push({
          date: workday.toISOString().split('T')[0],
          dayShort: format(workday, 'EEE'),
          timeline: dayTimeline,
          messageCount: messageCount,
        })
      }
      
      timelineData.push({
        userId,
        workdays: userTimeline.reverse(), // Most recent first
      })
    }

    const response = NextResponse.json({
      success: true,
      data: timelineData,
    })
    
    // Add cache headers to reduce database load
    response.headers.set('Cache-Control', 'public, max-age=60, stale-while-revalidate=120')
    
    return response

  } catch (error) {
    console.error('Error fetching user timelines:', error)
    return NextResponse.json(
      { error: 'Failed to fetch user timelines' },
      { status: 500 }
    )
  }
}