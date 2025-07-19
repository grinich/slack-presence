import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { startOfDay, endOfDay, subDays, format } from 'date-fns'

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const userId = searchParams.get('userId')
  
  if (!userId) {
    return NextResponse.json({ error: 'User ID is required' }, { status: 400 })
  }
  
  try {
    const today = new Date()
    
    // // Debug server timezone
    // console.log('🕒 SERVER TIMEZONE DEBUG:', {
    //   serverTime: today.toISOString(),
    //   serverLocal: today.toString(),
    //   serverHour: today.getHours(),
    //   serverMinutes: today.getMinutes(),
    //   serverTimezone: process.env.TZ || 'not set',
    //   serverOffset: today.getTimezoneOffset()
    // })
    
    const workdays = []
    
    // Get the last 7 days including today and weekends
    // Create a new date that represents "today" in the user's timezone
    const userTimezoneToday = new Date(today.getFullYear(), today.getMonth(), today.getDate())
    
    // Generate last 7 days (including today)
    for (let i = 0; i < 7; i++) {
      const date = subDays(userTimezoneToday, i)
      workdays.push(new Date(date))
    }
    
    // Reverse to get chronological order (oldest to newest)
    workdays.reverse()
    
    const timelineData = []
    
    for (const workday of workdays) {
      const dayStart = startOfDay(workday)
      const dayEnd = endOfDay(workday)
      
      // Get all presence logs for this workday
      const presenceLogs = await prisma.presenceLog.findMany({
        where: {
          userId: userId,
          timestamp: {
            gte: dayStart,
            lte: dayEnd,
          },
        },
        orderBy: {
          timestamp: 'asc',
        },
      })
      
      // // Debug presence logs for today
      // if (workday.toDateString() === new Date().toDateString()) {
      //   console.log(`🔍 PRESENCE LOGS FOR TODAY (${workday.toISOString().split('T')[0]}):`, {
      //     userId,
      //     dayStart: dayStart.toISOString(),
      //     dayEnd: dayEnd.toISOString(),
      //     totalLogs: presenceLogs.length,
      //     recentLogs: presenceLogs.slice(-5).map(log => ({
      //       status: log.status,
      //       timestamp: log.timestamp.toISOString(),
      //       metadata: log.metadata ? JSON.parse(log.metadata) : null
      //     }))
      //   })
      // }
      
      const messageCount = 0 // Messages removed - using presence data only
      
      // Create 15-minute timeline data (96 blocks per day: 24 hours * 4 blocks)
      const dayTimeline = []
      
      for (let hour = 0; hour < 24; hour++) {
        for (let quarter = 0; quarter < 4; quarter++) {
          const blockStart = new Date(dayStart)
          blockStart.setHours(hour, quarter * 15, 0, 0)
          
          const blockEnd = new Date(dayStart)
          blockEnd.setHours(hour, quarter * 15 + 14, 59, 999)
          
          // Find logs within this 15-minute block
          const blockLogs = presenceLogs.filter(log => 
            log.timestamp >= blockStart && log.timestamp <= blockEnd
          )
          
          const blockMessages = [] // Messages removed - using presence data only
          
          
          // Calculate online percentage for this 15-minute block
          const activeMinutes = blockLogs.filter(log => log.status === 'active').length
          const totalMinutesInBlock = 15 // Each block is 15 minutes
          const totalMinutesWithData = blockLogs.length
          const presencePercentage = totalMinutesWithData > 0 ? (activeMinutes / totalMinutesWithData) * 100 : 0
          
          // Debug current time block presence data (commented out)
          // const now = new Date()
          // const isCurrentBlock = now >= blockStart && now <= blockEnd
          // if (isCurrentBlock && workday.toDateString() === now.toDateString()) {
          //   console.log(`🎯 CURRENT TIME BLOCK PRESENCE DEBUG:`, {
          //     blockStart: blockStart.toISOString(),
          //     blockEnd: blockEnd.toISOString(),
          //     hour,
          //     quarter,
          //     blockLogs: blockLogs.length,
          //     activeMinutes,
          //     totalMinutes,
          //     presencePercentage,
          //     blockMessages: blockMessages.length,
          //     blockLogsDetails: blockLogs.map(log => ({
          //       status: log.status,
          //       timestamp: log.timestamp.toISOString()
          //     }))
          //   })
          // }
          
          const hasMessages = false // Messages removed - using presence data only
          
          // Determine status based on available data
          let status = 'no-data'
          let onlinePercentage = presencePercentage
          
          if (blockLogs.length === 0) {
            status = 'no-data'  // Light gray if no presence data available
          } else if (activeMinutes > 0) {
            status = 'online'   // Green if any activity detected
            onlinePercentage = presencePercentage
          } else {
            status = 'offline'  // Darker gray if user was away/offline
            onlinePercentage = 0
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
      
      timelineData.push({
        date: workday.toISOString().split('T')[0],
        dayName: format(workday, 'EEEE'),
        dayShort: format(workday, 'EEE'),
        timeline: dayTimeline,
        messageCount: messageCount,
      })
    }
    
    return NextResponse.json({
      success: true,
      data: {
        userId,
        workdays: timelineData,
      },
    })
  } catch (error) {
    console.error('Error fetching user timeline:', error)
    return NextResponse.json(
      { error: 'Failed to fetch user timeline' },
      { status: 500 }
    )
  }
}