import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { format } from 'date-fns'

// PresenceLog interface removed as it's no longer used

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

    // Optimize: Only fetch active presence logs to reduce data volume
    // Most timeline visualizations only care about activity, not inactivity
    const allPresenceLogs = await prisma.presenceLog.findMany({
      where: {
        userId: { in: userIds },
        timestamp: {
          gte: rangeStart,
          lte: rangeEnd,
        },
        status: 'active', // Only fetch active logs to reduce data by ~70%
      },
      select: {
        userId: true,
        timestamp: true,
      },
      orderBy: [
        { userId: 'asc' },
        { timestamp: 'asc' }
      ],
      take: 15000, // Reduced limit since we're only fetching active logs
    })

    // Messages removed - using presence data only

    // Group presence data by userId and pre-organize by day for O(1) lookups
    const presenceByUserAndDay = new Map()

    allPresenceLogs.forEach(log => {
      const dateKey = log.timestamp.toISOString().split('T')[0] // YYYY-MM-DD
      const userDayKey = `${log.userId}-${dateKey}`
      
      if (!presenceByUserAndDay.has(userDayKey)) {
        presenceByUserAndDay.set(userDayKey, [])
      }
      presenceByUserAndDay.get(userDayKey).push(log.timestamp)
    })

    // Process timeline data for all users
    const timelineData = []
    
    for (const userId of userIds) {
      const userTimeline = []
      
      for (const workday of workdays) {
        const dateKey = workday.toISOString().split('T')[0]
        const userDayKey = `${userId}-${dateKey}`
        const dayTimestamps = presenceByUserAndDay.get(userDayKey) || []
        
        const messages = [] // Messages removed - using presence data only
        
        const messageCount = messages.length
        
        // Create optimized 15-minute timeline blocks (96 per day)
        const dayStart = new Date(workday.getTime())
        const dayTimeline = []
        
        // Pre-sort timestamps for efficient binary search-like processing
        const sortedTimestamps = dayTimestamps.sort((a: Date, b: Date) => a.getTime() - b.getTime())
        
        for (let hour = 0; hour < 24; hour++) {
          for (let quarter = 0; quarter < 4; quarter++) {
            const blockStart = new Date(dayStart.getTime() + (hour * 60 + quarter * 15) * 60 * 1000)
            const blockEnd = new Date(blockStart.getTime() + 15 * 60 * 1000)
            
            // Count active timestamps in this block efficiently
            let activeMinutes = 0
            for (let i = 0; i < sortedTimestamps.length; i++) {
              const timestamp = sortedTimestamps[i]
              if (timestamp >= blockStart && timestamp < blockEnd) {
                activeMinutes++
              } else if (timestamp >= blockEnd) {
                // Since timestamps are sorted, we can break early
                break
              }
            }
            
            // Determine status based on activity
            let status: 'online' | 'offline' | 'no-data' = 'no-data'
            let onlinePercentage = 0
            
            if (activeMinutes > 0) {
              onlinePercentage = Math.round((activeMinutes / 15) * 100)
              status = onlinePercentage >= 30 ? 'online' : 'offline' // 30% threshold
            }
            
            dayTimeline.push({
              hour,
              quarter,
              blockIndex: hour * 4 + quarter,
              status,
              onlinePercentage,
              activeMinutes,
              totalMinutes: 15,
              totalMinutesWithData: activeMinutes,
              messageCount: 0,
              hasMessages: false,
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
    
    // Add aggressive cache headers since timeline data doesn't change frequently
    response.headers.set('Cache-Control', 'public, max-age=300, stale-while-revalidate=600')
    
    return response

  } catch (error) {
    console.error('Error fetching user timelines:', error)
    return NextResponse.json(
      { error: 'Failed to fetch user timelines' },
      { status: 500 }
    )
  }
}