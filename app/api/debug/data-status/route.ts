import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'

export async function GET() {
  try {
    console.log('🔍 Starting data status check...')
    
    // Get total user count
    const totalUsers = await prisma.user.count()
    
    // Get users with tokens (who can be monitored)
    const usersWithTokens = await prisma.user.count({
      where: {
        slackAccessToken: { not: null }
      }
    })
    
    // Get recent presence data (last hour)
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000)
    const recentPresenceCount = await prisma.presenceLog.count({
      where: {
        timestamp: { gte: oneHourAgo }
      }
    })
    
    // Get recent presence data (last 3 hours)
    const threeHoursAgo = new Date(Date.now() - 3 * 60 * 60 * 1000)
    const last3HoursPresenceCount = await prisma.presenceLog.count({
      where: {
        timestamp: { gte: threeHoursAgo }
      }
    })
    
    // Get most recent presence entry
    const mostRecentPresence = await prisma.presenceLog.findFirst({
      orderBy: { timestamp: 'desc' },
      include: {
        user: {
          select: { name: true, slackUserId: true }
        }
      }
    })
    
    // Get users with no recent presence data
    const usersWithNoRecentData = await prisma.user.findMany({
      where: {
        presenceLogs: {
          none: {
            timestamp: { gte: oneHourAgo }
          }
        }
      },
      select: {
        id: true,
        name: true,
        slackUserId: true,
        slackAccessToken: true
      },
      take: 10
    })
    
    // Check presence data by user for debugging
    const presenceByUser = await prisma.presenceLog.groupBy({
      by: ['userId'],
      where: {
        timestamp: { gte: threeHoursAgo }
      },
      _count: {
        id: true
      },
      orderBy: {
        _count: {
          id: 'desc'
        }
      },
      take: 10
    })
    
    // Get user names for the grouped data
    const userIds = presenceByUser.map(p => p.userId)
    const userNames = await prisma.user.findMany({
      where: { id: { in: userIds } },
      select: { id: true, name: true }
    })
    
    const presenceWithNames = presenceByUser.map(p => ({
      userId: p.userId,
      userName: userNames.find(u => u.id === p.userId)?.name || 'Unknown',
      count: p._count.id
    }))

    return NextResponse.json({
      status: 'ok',
      timestamp: new Date().toISOString(),
      data: {
        users: {
          total: totalUsers,
          withTokens: usersWithTokens,
          withoutTokens: totalUsers - usersWithTokens
        },
        presence: {
          lastHour: recentPresenceCount,
          last3Hours: last3HoursPresenceCount,
          mostRecent: mostRecentPresence ? {
            timestamp: mostRecentPresence.timestamp,
            user: mostRecentPresence.user.name,
            status: mostRecentPresence.status
          } : null
        },
        issues: {
          usersWithNoRecentData: usersWithNoRecentData.map(u => ({
            name: u.name,
            hasToken: !!u.slackAccessToken
          }))
        },
        topActiveUsers: presenceWithNames
      }
    })
    
  } catch (error) {
    console.error('❌ Error in data status check:', error)
    const errorMessage = error instanceof Error ? error.message : String(error)
    return NextResponse.json({ 
      error: 'Data status check failed',
      details: errorMessage 
    }, { status: 500 })
  }
}