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
  blockStart: string
  blockEnd: string
}

interface DayData {
  date: string
  dayName: string
  dayShort: string
  totalActiveMinutes: number
  timeline: PresenceBlock[]
}

interface UserData {
  id: string
  name: string | null
  avatarUrl: string | null
  timezone: string | null
  slackUserId: string
}

interface UserActivityData {
  user: UserData
  days: DayData[]
  totalWeeks: number
  totalActiveMinutes: number
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ userId: string }> }
) {
  const { searchParams } = new URL(request.url)
  const startParam = searchParams.get('start')
  const endParam = searchParams.get('end')
  const { userId } = await params

  if (!userId) {
    return NextResponse.json(
      { error: 'User ID is required' },
      { status: 400 }
    )
  }

  try {
    const startTime = Date.now()

    // Get user information
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        name: true,
        avatarUrl: true,
        timezone: true,
        slackUserId: true,
      },
    })

    if (!user) {
      return NextResponse.json(
        { error: 'User not found' },
        { status: 404 }
      )
    }

    // Calculate date boundaries
    let startDate: Date
    let endDate: Date

    if (startParam && endParam) {
      startDate = new Date(startParam)
      endDate = new Date(endParam)
    } else {
      // Default to last 2 weeks
      endDate = new Date()
      startDate = new Date()
      startDate.setDate(endDate.getDate() - 14)
    }

    // Use the start and end dates as provided by the client
    // The client already calculated the correct boundaries in their local timezone
    const adjustedStartDate = startDate
    const adjustedEndDate = endDate

    console.log(`📊 Fetching user activity for ${userId} from ${adjustedStartDate.toISOString()} to ${adjustedEndDate.toISOString()}`)

    // Get all presence logs for the user within the date range
    const presenceLogs = await prisma.presenceLog.findMany({
      where: {
        userId: userId,
        timestamp: {
          gte: adjustedStartDate,
          lte: adjustedEndDate,
        },
      },
      select: {
        status: true,
        timestamp: true,
      },
      orderBy: {
        timestamp: 'asc',
      },
    })

    console.log(`📊 Found ${presenceLogs.length} presence logs for user ${userId}`)

    // Group presence logs by date
    const logsByDate = new Map<string, Array<{ timestamp: Date, status: string }>>()
    
    presenceLogs.forEach(log => {
      const dateKey = log.timestamp.toISOString().split('T')[0]
      if (!logsByDate.has(dateKey)) {
        logsByDate.set(dateKey, [])
      }
      logsByDate.get(dateKey)!.push({
        timestamp: log.timestamp,
        status: log.status
      })
    })

    // Generate daily data for each day in the range
    const days: DayData[] = []
    let totalActiveMinutes = 0
    
    const currentDate = new Date(adjustedStartDate)
    
    while (currentDate <= adjustedEndDate) {
      const dateKey = currentDate.toISOString().split('T')[0]
      const dayLogs = logsByDate.get(dateKey) || []
      
      // Create 24-hour timeline (96 15-minute blocks)
      const timeline: PresenceBlock[] = []
      let dayActiveMinutes = 0
      
      // Get the start of the current day, preserving the client's timezone intent
      const dayStart = new Date(currentDate)
      dayStart.setHours(0, 0, 0, 0)
      
      for (let hour = 0; hour < 24; hour++) {
        for (let quarter = 0; quarter < 4; quarter++) {
          // Calculate block times relative to the day start
          const blockStart = new Date(dayStart.getTime() + (hour * 60 + quarter * 15) * 60 * 1000)
          const blockEnd = new Date(blockStart.getTime() + 15 * 60 * 1000)
          
          // Find logs within this 15-minute block
          const blockLogs = dayLogs.filter(log => 
            log.timestamp >= blockStart && log.timestamp < blockEnd
          )
          
          const activeMinutes = blockLogs.filter(log => log.status === 'active').length
          const onlinePercentage = blockLogs.length > 0 ? Math.round((activeMinutes / blockLogs.length) * 100) : 0
          
          let status: 'online' | 'offline' | 'no-data'
          if (blockLogs.length === 0) {
            status = 'no-data'
          } else if (activeMinutes >= 6) { // Require 6+ active minutes in 15-minute block
            status = 'online'
          } else {
            status = 'offline'
          }
          
          timeline.push({
            hour,
            quarter,
            blockIndex: hour * 4 + quarter,
            status,
            onlinePercentage,
            activeMinutes,
            totalMinutes: 15,
            blockStart: blockStart.toISOString(),
            blockEnd: blockEnd.toISOString(),
          })
          
          dayActiveMinutes += activeMinutes
        }
      }
      
      // Get day name from the dateKey (YYYY-MM-DD) to ensure it matches the client's expectation
      // Parse the date parts and create a date that represents the same calendar day
      const [year, month, day] = dateKey.split('-').map(Number)
      const dateForDayName = new Date(year, month - 1, day) // month is 0-indexed
      const dayName = dateForDayName.toLocaleDateString('en-US', { weekday: 'long' })
      const dayShort = dateForDayName.toLocaleDateString('en-US', { weekday: 'short' })
      
      days.push({
        date: dateKey,
        dayName,
        dayShort,
        totalActiveMinutes: dayActiveMinutes,
        timeline,
      })
      
      totalActiveMinutes += dayActiveMinutes
      
      // Move to next day
      currentDate.setDate(currentDate.getDate() + 1)
    }

    // Calculate total weeks
    const totalDays = days.length
    const totalWeeks = Math.ceil(totalDays / 7)

    const responseData: UserActivityData = {
      user: {
        id: user.id,
        name: user.name,
        avatarUrl: user.avatarUrl,
        timezone: user.timezone,
        slackUserId: user.slackUserId,
      },
      days: days.reverse(), // Most recent first
      totalWeeks,
      totalActiveMinutes,
    }

    console.log(`📊 User activity processing completed in ${Date.now() - startTime}ms`)

    const response = NextResponse.json({
      success: true,
      data: responseData,
    })

    // Cache for 5 minutes
    response.headers.set('Cache-Control', 'public, max-age=300, stale-while-revalidate=600')

    return response

  } catch (error) {
    console.error('Error fetching user activity:', error)
    return NextResponse.json(
      { error: 'Failed to fetch user activity' },
      { status: 500 }
    )
  }
}