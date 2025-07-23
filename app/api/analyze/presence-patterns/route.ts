import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export async function GET(request: NextRequest) {
  try {
    console.log('🔍 Analyzing presence patterns over last 72 hours...')
    
    // Get random sample of active users
    const users = await prisma.$queryRaw<Array<{
      id: string
      name: string
      slack_user_id: string
      total_logs: bigint
      active_logs: bigint
    }>>`
      SELECT 
        u.id::text,
        u.name,
        u.slack_user_id,
        COUNT(pl.id) as total_logs,
        COUNT(CASE WHEN pl.status = 'active' THEN 1 END) as active_logs
      FROM users u
      JOIN presence_logs pl ON u.id = pl.user_id
      WHERE pl.timestamp >= NOW() - INTERVAL '72 hours'
        AND u.name IS NOT NULL
        AND u.name NOT ILIKE '%team analytics%'
      GROUP BY u.id, u.name, u.slack_user_id
      HAVING COUNT(pl.id) > 50
      ORDER BY RANDOM()
      LIMIT 8
    `

    console.log(`Found ${users.length} users with sufficient data`)
    
    const analysisResults = []
    
    // Analyze each user's session patterns
    for (const user of users) {
      const activePercentage = (Number(user.active_logs) / Number(user.total_logs) * 100).toFixed(1)
      
      // Get detailed session analysis
      const sessionData = await prisma.$queryRaw<Array<{
        session_starts: bigint
        avg_offline_gap: number | null
        max_offline_gap: number | null
        long_gaps: bigint
        very_long_gaps: bigint
        short_sessions: bigint
      }>>`
        WITH user_timeline AS (
          SELECT 
            pl.timestamp,
            pl.status,
            LAG(pl.timestamp) OVER (ORDER BY pl.timestamp) as prev_timestamp,
            LAG(pl.status) OVER (ORDER BY pl.timestamp) as prev_status
          FROM presence_logs pl
          WHERE pl.user_id = ${user.id}
            AND pl.timestamp >= NOW() - INTERVAL '48 hours'
          ORDER BY pl.timestamp
        ),
        session_changes AS (
          SELECT 
            timestamp,
            status,
            prev_status,
            EXTRACT(EPOCH FROM (timestamp - prev_timestamp))/60 as gap_minutes,
            CASE 
              WHEN status = 'active' AND (prev_status IS NULL OR prev_status != 'active') THEN 'SESSION_START'
              WHEN status != 'active' AND prev_status = 'active' THEN 'SESSION_END'
              ELSE 'CONTINUE'
            END as event_type
          FROM user_timeline
          WHERE prev_timestamp IS NOT NULL
        ),
        session_durations AS (
          SELECT 
            s1.timestamp as session_start,
            s2.timestamp as session_end,
            EXTRACT(EPOCH FROM (s2.timestamp - s1.timestamp))/60 as session_duration_minutes
          FROM session_changes s1
          LEFT JOIN session_changes s2 ON s2.timestamp > s1.timestamp 
            AND s2.event_type = 'SESSION_END'
          WHERE s1.event_type = 'SESSION_START'
            AND s2.timestamp IS NOT NULL
        )
        SELECT 
          COUNT(CASE WHEN event_type = 'SESSION_START' THEN 1 END) as session_starts,
          ROUND(AVG(CASE WHEN event_type = 'SESSION_START' AND gap_minutes > 0 THEN gap_minutes END)::numeric, 1) as avg_offline_gap,
          MAX(CASE WHEN event_type = 'SESSION_START' AND gap_minutes > 0 THEN gap_minutes END) as max_offline_gap,
          COUNT(CASE WHEN event_type = 'SESSION_START' AND gap_minutes > 30 THEN 1 END) as long_gaps,
          COUNT(CASE WHEN event_type = 'SESSION_START' AND gap_minutes > 120 THEN 1 END) as very_long_gaps,
          (SELECT COUNT(*) FROM session_durations WHERE session_duration_minutes < 15) as short_sessions
        FROM session_changes
        WHERE gap_minutes IS NOT NULL
      `

      const stats = sessionData[0]
      if (!stats) continue

      const sessionCount = Number(stats.session_starts)
      const avgGap = Number(stats.avg_offline_gap) || 0
      const longGaps = Number(stats.long_gaps)
      const veryLongGaps = Number(stats.very_long_gaps)
      const shortSessions = Number(stats.short_sessions)
      
      // Classify pattern type
      let patternType = 'NORMAL'
      let description = 'Regular activity pattern'
      
      if (sessionCount > 15 && avgGap > 45 && longGaps > sessionCount * 0.4) {
        patternType = 'SPORADIC'
        description = 'Many brief sessions with long offline periods between them'
      } else if (sessionCount > 20 && shortSessions > sessionCount * 0.6) {
        patternType = 'MICRO_SESSIONS'
        description = 'Frequent very short online sessions (< 15 min)'
      } else if (veryLongGaps > sessionCount * 0.3) {
        patternType = 'PERIODIC'
        description = 'Regular sessions but with some very long gaps (>2 hours)'
      } else if (Number(activePercentage) < 20) {
        patternType = 'LOW_ACTIVITY'
        description = 'Generally low online presence'
      }
      
      analysisResults.push({
        name: user.name,
        activePercentage: Number(activePercentage),
        totalLogs: Number(user.total_logs),
        sessionCount,
        avgOfflineGap: avgGap,
        maxOfflineGap: Number(stats.max_offline_gap) || 0,
        longGaps,
        veryLongGaps,
        shortSessions,
        patternType,
        description
      })
    }
    
    // Sort by most interesting patterns first
    const sortedResults = analysisResults.sort((a, b) => {
      const priorityOrder = { 'SPORADIC': 0, 'MICRO_SESSIONS': 1, 'PERIODIC': 2, 'LOW_ACTIVITY': 3, 'NORMAL': 4 }
      const aPriority = priorityOrder[a.patternType as keyof typeof priorityOrder] || 5
      const bPriority = priorityOrder[b.patternType as keyof typeof priorityOrder] || 5
      
      if (aPriority !== bPriority) return aPriority - bPriority
      return b.sessionCount - a.sessionCount
    })

    return NextResponse.json({
      success: true,
      data: {
        totalUsersAnalyzed: users.length,
        analysis: sortedResults,
        summary: {
          sporadicUsers: sortedResults.filter(r => r.patternType === 'SPORADIC').length,
          microSessionUsers: sortedResults.filter(r => r.patternType === 'MICRO_SESSIONS').length,
          periodicUsers: sortedResults.filter(r => r.patternType === 'PERIODIC').length,
          normalUsers: sortedResults.filter(r => r.patternType === 'NORMAL').length
        }
      }
    })

  } catch (error) {
    console.error('Error analyzing presence patterns:', error)
    return NextResponse.json(
      { success: false, error: 'Failed to analyze patterns' },
      { status: 500 }
    )
  }
}