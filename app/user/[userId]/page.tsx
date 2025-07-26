'use client'

import { useEffect, useState, useCallback } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { ArrowLeft, Calendar, Clock, Activity } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import DailyTimeline from '@/components/DailyTimeline'
import WeeklyOverview from '@/components/WeeklyOverview'

interface UserData {
  id: string
  name: string | null
  avatarUrl: string | null
  timezone: string | null
  slackUserId: string
}

interface DayData {
  date: string
  dayName: string
  dayShort: string
  totalActiveMinutes: number
  timeline: TimelineBlock[]
}

interface TimelineBlock {
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

interface UserActivityData {
  user: UserData
  days: DayData[]
  totalWeeks: number
  totalActiveMinutes: number
}

export default function UserDetailPage() {
  const params = useParams()
  const router = useRouter()
  const userId = params.userId as string
  
  const [data, setData] = useState<UserActivityData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [dateRange, setDateRange] = useState({ weeks: 2 }) // Default to 2 weeks

  const fetchUserActivity = useCallback(async (weeks: number) => {
    try {
      setLoading(true)
      // Create end date at end of today to include full current day
      const endDate = new Date()
      endDate.setHours(23, 59, 59, 999)
      
      // Create start date at beginning of the start day
      const startDate = new Date()
      startDate.setDate(endDate.getDate() - (weeks * 7))
      startDate.setHours(0, 0, 0, 0)
      
      const timezoneOffset = startDate.getTimezoneOffset()
      const response = await fetch(
        `/api/user/${userId}/activity?start=${startDate.toISOString()}&end=${endDate.toISOString()}&tz=${timezoneOffset}`
      )
      const result = await response.json()
      
      if (result.success) {
        setData(result.data)
      } else {
        setError(result.error || 'Failed to fetch user activity')
      }
    } catch {
      setError('Network error')
    } finally {
      setLoading(false)
    }
  }, [userId])

  useEffect(() => {
    fetchUserActivity(dateRange.weeks)
  }, [fetchUserActivity, dateRange.weeks])

  const formatNameAsFirstNameLastInitial = (name: string | null) => {
    if (!name) return 'Unknown User'
    const parts = name.trim().split(' ')
    if (parts.length === 1) return parts[0]
    const firstName = parts[0]
    const lastInitial = parts[parts.length - 1][0]?.toUpperCase()
    return lastInitial ? `${firstName} ${lastInitial}.` : firstName
  }

  const formatMinutes = (minutes: number) => {
    const hours = Math.floor(minutes / 60)
    const mins = minutes % 60
    return hours > 0 ? `${hours}h ${mins}m` : `${mins}m`
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-background">
        <div className="max-w-7xl mx-auto px-6 py-12">
          <div className="flex items-center justify-center py-12">
            <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-blue-600"></div>
          </div>
        </div>
      </div>
    )
  }

  if (error || !data) {
    return (
      <div className="min-h-screen bg-background">
        <div className="max-w-7xl mx-auto px-6 py-12">
          <Card className="w-96 mx-auto">
            <CardHeader>
              <CardTitle className="text-red-600">Error</CardTitle>
              <CardDescription>{error || 'User not found'}</CardDescription>
            </CardHeader>
          </Card>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-7xl mx-auto px-6 py-12">
        {/* Header */}
        <div className="mb-8">
          <div className="flex items-center gap-4 mb-6">
            <a 
              href="/"
              className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground transition-colors"
            >
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back to Dashboard
            </a>
          </div>
          
          <div className="flex items-start justify-between">
            <div className="flex items-center gap-6">
              <div className="relative">
                {data.user.avatarUrl ? (
                  <img
                    src={data.user.avatarUrl}
                    alt={data.user.name || 'User'}
                    className="w-16 h-16 rounded-full ring-4 ring-border"
                  />
                ) : (
                  <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center ring-4 ring-border">
                    <span className="text-2xl font-medium text-muted-foreground">
                      {data.user.name?.[0]?.toUpperCase() || 'U'}
                    </span>
                  </div>
                )}
              </div>
              <div>
                <h1 className="text-3xl font-semibold tracking-tight text-foreground mb-2">
                  {formatNameAsFirstNameLastInitial(data.user.name)}
                </h1>
                <p className="text-lg text-muted-foreground">
                  Activity over the last {dateRange.weeks} weeks
                </p>
              </div>
            </div>
            
            <div className="flex items-center gap-3">
              <Calendar className="h-4 w-4 text-muted-foreground" />
              <select
                value={dateRange.weeks}
                onChange={(e) => setDateRange({ weeks: parseInt(e.target.value) })}
                className="px-3 py-2 border border-border rounded-lg text-sm bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:border-transparent"
              >
                <option value={1}>1 Week</option>
                <option value={2}>2 Weeks</option>
                <option value={3}>3 Weeks</option>
                <option value={4}>4 Weeks</option>
              </select>
            </div>
          </div>
        </div>

        {/* Stats Overview */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <Activity className="h-5 w-5 text-success" />
                <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Total Active</span>
              </div>
              <div className="space-y-1">
                <div className="text-3xl font-semibold text-foreground">
                  {formatMinutes(data.totalActiveMinutes)}
                </div>
                <p className="text-sm text-muted-foreground">
                  Last {dateRange.weeks} weeks
                </p>
              </div>
            </CardHeader>
          </Card>

          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <Clock className="h-5 w-5 text-muted-foreground" />
                <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Daily Average</span>
              </div>
              <div className="space-y-1">
                <div className="text-3xl font-semibold text-foreground">
                  {formatMinutes(Math.round(data.totalActiveMinutes / (dateRange.weeks * 7)))}
                </div>
                <p className="text-sm text-muted-foreground">
                  Per day
                </p>
              </div>
            </CardHeader>
          </Card>

          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <Calendar className="h-5 w-5 text-muted-foreground" />
                <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Active Days</span>
              </div>
              <div className="space-y-1">
                <div className="text-3xl font-semibold text-foreground">
                  {data.days.filter(day => day.totalActiveMinutes > 0).length}
                </div>
                <p className="text-sm text-muted-foreground">
                  Out of {data.days.length} days
                </p>
              </div>
            </CardHeader>
          </Card>
        </div>

        {/* Weekly Overview */}
        <Card>
          <CardHeader>
            <CardTitle>Weekly Activity Overview</CardTitle>
            <CardDescription>
              Activity intensity heatmap and weekly patterns
            </CardDescription>
          </CardHeader>
          <div className="p-6">
            <WeeklyOverview days={data.days} />
          </div>
        </Card>

        {/* Daily Activity Timeline */}
        <Card>
          <CardHeader>
            <CardTitle>Daily Activity Timeline</CardTitle>
            <CardDescription>
              Detailed 24-hour activity patterns for each day
            </CardDescription>
          </CardHeader>
          <div className="p-6">
            <DailyTimeline days={data.days} />
          </div>
        </Card>
      </div>
    </div>
  )
}