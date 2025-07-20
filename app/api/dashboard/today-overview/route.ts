import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { startOfDay, endOfDay } from 'date-fns'

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    
    // Get date range from query parameters, or default to UTC today
    const startParam = searchParams.get('start')
    const endParam = searchParams.get('end')
    
    let todayStart: Date
    let todayEnd: Date
    
    if (startParam && endParam) {
      // Use client-provided UTC date range
      todayStart = new Date(startParam)
      todayEnd = new Date(endParam)
      // Client-provided date range
    } else {
      // Fallback to UTC today
      const now = new Date()
      todayStart = startOfDay(now)
      todayEnd = endOfDay(now)
      // Using server UTC dates
    }
    
    // Get all active users with their presence data for today (optimized)
    const users = await prisma.user.findMany({
      where: {
        // Exclude users marked as inactive
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
        presenceLogs: {
          where: {
            timestamp: {
              gte: todayStart,
              lte: todayEnd,
            },
          },
          select: {
            status: true,
            timestamp: true,
          },
          orderBy: {
            timestamp: 'asc',
          },
        },
      },
    })
    
    // Process each user's timeline data for today
    const userTodayData = users.map(user => {
      // Check if user has been active in the last 15 minutes
      const fifteenMinutesAgo = new Date(Date.now() - 15 * 60 * 1000)
      const recentActiveLogs = user.presenceLogs.filter(log => 
        log.timestamp >= fifteenMinutesAgo && log.status === 'active'
      )
      const isCurrentlyOnline = recentActiveLogs.length > 0
      
      // Find the most recent active presence log for "last seen" tooltip
      const allActiveLogs = user.presenceLogs.filter(log => log.status === 'active')
      const lastActiveTime = allActiveLogs.length > 0 
        ? allActiveLogs[allActiveLogs.length - 1].timestamp 
        : null
      // Create timeline blocks for 24 hours (96 15-minute blocks)
      const timeline = []
      
      for (let hour = 0; hour < 24; hour++) {
        for (let quarter = 0; quarter < 4; quarter++) {
          // Create blocks that represent the user's local time hours
          // Since todayStart is already the start of the user's day in UTC,
          // we can add hours/minutes directly
          const blockStart = new Date(todayStart.getTime() + (hour * 60 + quarter * 15) * 60 * 1000)
          
          const blockEnd = new Date(blockStart.getTime() + 15 * 60 * 1000)
          
          // Find presence logs within this 15-minute block
          const blockLogs = user.presenceLogs.filter(log => 
            log.timestamp >= blockStart && log.timestamp < blockEnd
          )
          
          // Calculate activity in this block
          let activeMinutes = 0
          const totalMinutes = 15
          const messageCount = 0
          const hasMessages = false
          
          // If we have presence logs, calculate active time
          if (blockLogs.length > 0) {
            // Count active presence logs (each represents ~1 minute)
            activeMinutes = blockLogs.filter(log => log.status === 'active').length
            
            // For message counting, we'd need message data which isn't available in current schema
            // This would be implemented when message collection is restored
          }
          
          const onlinePercentage = Math.round((activeMinutes / totalMinutes) * 100)
          
          // Determine status based on available data
          let status: 'online' | 'offline' | 'no-data'
          if (blockLogs.length === 0) {
            status = 'no-data'  // Light gray if no presence data available
          } else if (activeMinutes > 0) {
            status = 'online'   // Green if any activity detected
          } else {
            status = 'offline'  // Darker gray if user was away/offline
          }
          
          timeline.push({
            hour,
            quarter,
            blockIndex: hour * 4 + quarter,
            status,
            onlinePercentage,
            activeMinutes,
            totalMinutes,
            messageCount,
            hasMessages,
            blockStart: blockStart.toISOString(), // UTC timestamp
            blockEnd: blockEnd.toISOString() // UTC timestamp
          })
          
          // Timeline block created
        }
      }
      
      // Calculate total active minutes for today
      const totalActiveMinutes = timeline.reduce((sum, block) => sum + block.activeMinutes, 0)
      const totalMessageCount = timeline.reduce((sum, block) => sum + block.messageCount, 0)
      
      return {
        id: user.id,
        name: user.name,
        avatarUrl: user.avatarUrl,
        timezone: user.timezone,
        timeline,
        totalActiveMinutes,
        messageCount: totalMessageCount,
        isCurrentlyOnline,
        lastActiveTime: lastActiveTime?.toISOString() || null
      }
    })
    
    // User timezone data processed
    
    // Don't sort here - let the frontend handle timezone sorting
    
    const response = NextResponse.json({
      success: true,
      data: userTodayData
    })
    
    // Add cache headers for better performance
    response.headers.set('Cache-Control', 'public, max-age=30, stale-while-revalidate=60')
    
    return response
    
  } catch (error) {
    console.error('Error fetching today overview:', error)
    return NextResponse.json(
      { error: 'Failed to fetch today overview' },
      { status: 500 }
    )
  }
}