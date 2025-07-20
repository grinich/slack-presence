import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const userName = searchParams.get('name')
    
    if (!userName) {
      return NextResponse.json({ error: 'User name parameter is required' }, { status: 400 })
    }

    // 1. Find the user record for Zac
    const user = await prisma.user.findFirst({
      where: {
        name: {
          contains: userName,
          mode: 'insensitive'
        }
      },
      select: {
        id: true,
        name: true,
        slackUserId: true,
        email: true,
        timezone: true,
        metadata: true,
        createdAt: true,
        updatedAt: true
      }
    })

    if (!user) {
      return NextResponse.json({ error: `User "${userName}" not found` }, { status: 404 })
    }

    // 2. Get recent presence logs (last 24 hours)
    const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000)
    
    const recentLogs = await prisma.presenceLog.findMany({
      where: {
        userId: user.id,
        timestamp: {
          gte: twentyFourHoursAgo
        }
      },
      orderBy: {
        timestamp: 'desc'
      },
      take: 100 // Limit to last 100 entries
    })

    // 3. Get summary statistics
    const totalLogs = await prisma.presenceLog.count({
      where: {
        userId: user.id
      }
    })

    const statusCounts = await prisma.presenceLog.groupBy({
      by: ['status'],
      where: {
        userId: user.id,
        timestamp: {
          gte: twentyFourHoursAgo
        }
      },
      _count: {
        status: true
      }
    })

    // 4. Parse metadata to analyze raw_presence vs adjusted status
    const logsWithParsedMetadata = recentLogs.map(log => {
      let parsedMetadata = null
      try {
        if (log.metadata) {
          parsedMetadata = JSON.parse(log.metadata)
        }
      } catch {
        // Ignore parsing errors
      }
      
      return {
        ...log,
        parsedMetadata
      }
    })

    // 5. Check for data collection patterns
    const timestamps = recentLogs.map(log => log.timestamp.toISOString())
    const timeGaps = []
    
    for (let i = 0; i < timestamps.length - 1; i++) {
      const current = new Date(timestamps[i])
      const next = new Date(timestamps[i + 1])
      const gapMinutes = (current.getTime() - next.getTime()) / (1000 * 60)
      timeGaps.push({
        from: timestamps[i + 1],
        to: timestamps[i],
        gapMinutes: Math.round(gapMinutes * 100) / 100
      })
    }

    const response = {
      user: {
        ...user,
        parsedMetadata: user.metadata ? JSON.parse(user.metadata) : null
      },
      summary: {
        totalLogsAllTime: totalLogs,
        logsLast24Hours: recentLogs.length,
        statusBreakdown: statusCounts.reduce((acc, item) => {
          acc[item.status] = item._count.status
          return acc
        }, {} as Record<string, number>)
      },
      recentLogs: logsWithParsedMetadata.slice(0, 20), // Show latest 20 for readability
      dataQualityAnalysis: {
        averageGapMinutes: timeGaps.length > 0 
          ? Math.round((timeGaps.reduce((sum, gap) => sum + gap.gapMinutes, 0) / timeGaps.length) * 100) / 100
          : 0,
        largestGaps: timeGaps
          .filter(gap => gap.gapMinutes > 30) // Gaps longer than 30 minutes
          .slice(0, 10)
          .sort((a, b) => b.gapMinutes - a.gapMinutes),
        collectionsWithMetadata: logsWithParsedMetadata.filter(log => log.parsedMetadata).length,
        collectionsWithoutMetadata: logsWithParsedMetadata.filter(log => !log.parsedMetadata).length
      }
    }

    return NextResponse.json(response)
  } catch (error) {
    console.error('Error investigating user presence:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}