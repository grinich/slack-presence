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
    const today = new Date()
    
    const workdays = []
    
    // Get the last 7 days including today and weekends
    const userTimezoneToday = new Date(today.getFullYear(), today.getMonth(), today.getDate())
    
    // Generate last 7 days (including today)
    for (let i = 0; i < 7; i++) {
      const date = subDays(userTimezoneToday, i)
      workdays.push(new Date(date))
    }
    
    // Get date range for all workdays
    const oldestWorkday = workdays[workdays.length - 1]
    const newestWorkday = workdays[0]
    const rangeStart = startOfDay(oldestWorkday)
    const rangeEnd = endOfDay(newestWorkday)

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
        const dayStart = startOfDay(workday)
        const dayEnd = endOfDay(workday)
        
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
            const blockStart = new Date(dayStart)
            blockStart.setHours(hour, quarter * 15, 0, 0)
            
            const blockEnd = new Date(dayStart)
            blockEnd.setHours(hour, quarter * 15 + 14, 59, 999)
            
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

    return NextResponse.json({
      success: true,
      data: timelineData,
    })

  } catch (error) {
    console.error('Error fetching user timelines:', error)
    return NextResponse.json(
      { error: 'Failed to fetch user timelines' },
      { status: 500 }
    )
  }
}