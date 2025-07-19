'use client'

import { useEffect, useState } from 'react'
import { useSession } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Users, Clock, Activity, TrendingUp, LogOut } from 'lucide-react'
import UserTimeline from '@/components/UserTimeline'
import TodayOverview from '@/components/TodayOverview'

interface UserStats {
  id: string
  name: string
  avatarUrl: string | null
  timezone: string | null
  totalActiveMinutes: number
  todayActiveMinutes: number
  lastSeen: string | null
  isOnline: boolean
}


interface WorkdayData {
  date: string
  dayName: string
  dayShort: string
  timeline: {
    hour: number
    quarter: number
    blockIndex: number
    status: 'online' | 'offline' | 'no-data'
    onlinePercentage: number
    activeMinutes: number
    totalMinutes: number
    messageCount: number
    hasMessages: boolean
    blockStart: string
    blockEnd: string
  }[]
  messageCount: number
}

interface UserTodayData {
  id: string
  name: string
  avatarUrl: string | null
  timezone: string | null
  timeline: {
    hour: number
    quarter: number
    blockIndex: number
    status: 'online' | 'offline' | 'no-data'
    onlinePercentage: number
    activeMinutes: number
    totalMinutes: number
    messageCount: number
    hasMessages: boolean
    blockStart: string
    blockEnd: string
  }[]
  totalActiveMinutes: number
  messageCount: number
}


export default function AuthenticatedDashboard() {
  const { status } = useSession()
  const router = useRouter()
  const [data, setData] = useState<UserStats[] | null>(null)
  const [timelineData, setTimelineData] = useState<Map<string, WorkdayData[]> | null>(null)
  const [todayData, setTodayData] = useState<UserTodayData[] | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [lastRefresh, setLastRefresh] = useState<number>(0)

  // Redirect to sign-in if not authenticated
  useEffect(() => {
    if (status === 'unauthenticated') {
      router.push('/auth/signin')
    }
  }, [status, router])

  useEffect(() => {
    async function fetchData(force = false) {
      if (status !== 'authenticated') return
      
      // Skip refresh if not enough time has passed (unless forced)
      const now = Date.now()
      if (!force && now - lastRefresh < 25000) { // 25 second minimum
        return
      }
      
      try {
        console.log('Fetching dashboard data...')
        setLastRefresh(now)
        
        // Calculate today in user's local timezone and convert to UTC for server
        const userNow = new Date()
        const userTodayStart = new Date(userNow.getFullYear(), userNow.getMonth(), userNow.getDate())
        const userTodayEnd = new Date(userTodayStart)
        userTodayEnd.setDate(userTodayEnd.getDate() + 1)
        userTodayEnd.setMilliseconds(-1) // End of day
        
        console.log('Client timezone info:', {
          userNow: userNow.toISOString(),
          localDate: `${userNow.getFullYear()}-${userNow.getMonth() + 1}-${userNow.getDate()}`,
          userTodayStart: userTodayStart.toISOString(),
          userTodayEnd: userTodayEnd.toISOString(),
          timezone: Intl.DateTimeFormat().resolvedOptions().timeZone
        })
        
        // Fetch today's overview with timezone-aware date range
        const [todayResponse] = await Promise.all([
          fetch(`/api/dashboard/today-overview?start=${userTodayStart.toISOString()}&end=${userTodayEnd.toISOString()}`)
        ])
        
        const [todayResult] = await Promise.all([
          todayResponse.json()
        ])
        
        if (todayResult.success) {
          // Transform UserTodayData to UserStats format
          const transformedData: UserStats[] = todayResult.data.map((user: UserTodayData) => ({
            id: user.id,
            name: user.name,
            avatarUrl: user.avatarUrl,
            timezone: user.timezone,
            totalActiveMinutes: user.totalActiveMinutes,
            todayActiveMinutes: user.totalActiveMinutes,
            lastSeen: null, // Not available in current API
            isOnline: user.totalActiveMinutes > 0 // Simple heuristic - user is "online" if they had activity today
          }))
          
          setData(transformedData)
          setTodayData(todayResult.data)
          
          // Extract user IDs and fetch timeline data in batch
          const userIds = todayResult.data.map((user: UserTodayData) => user.id)
          
          if (userIds.length > 0) {
            const timelineResponse = await fetch(`/api/dashboard/user-timelines?userIds=${userIds.join(',')}&start=${userTodayStart.toISOString()}`)
            const timelineResult = await timelineResponse.json()
            
            if (timelineResult.success) {
              // Convert array to map for easier lookup
              const timelineMap = new Map()
              timelineResult.data.forEach((userTimeline: { userId: string; workdays: unknown }) => {
                timelineMap.set(userTimeline.userId, userTimeline.workdays)
              })
              setTimelineData(timelineMap)
            }
          }
        } else {
          setError(todayResult.error || 'Failed to fetch data')
        }
      } catch {
        setError('Network error')
      } finally {
        setLoading(false)
      }
    }

    // Initial fetch
    fetchData(true) // Force initial load

    // Auto-refresh every 30 seconds at the 15-second mark (offset from timeline)
    const now = new Date()
    const secondsToWait = 15 - (now.getSeconds() % 30)
    const timeToFirstRefresh = secondsToWait <= 0 ? 30 + secondsToWait : secondsToWait
    
    let refreshInterval: NodeJS.Timeout | null = null
    
    // First refresh aligned to 15-second mark
    const firstTimeout = setTimeout(() => {
      fetchData()
      
      // Then refresh every 30 seconds
      refreshInterval = setInterval(() => {
        fetchData()
      }, 30000)
    }, timeToFirstRefresh * 1000)

    return () => {
      clearTimeout(firstTimeout)
      if (refreshInterval) {
        clearInterval(refreshInterval)
      }
    }
  }, [status, lastRefresh, router])



  const handleLogout = async () => {
    try {
      const response = await fetch('/api/auth/logout', {
        method: 'POST'
      })
      
      if (response.ok) {
        // Redirect to login page
        router.push('/auth/signin')
      } else {
        // Fallback: redirect anyway
        router.push('/auth/signin')
      }
    } catch {
      // Fallback: redirect anyway
      router.push('/auth/signin')
    }
  }


  if (status === 'loading' || loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-blue-600"></div>
      </div>
    )
  }

  if (status === 'unauthenticated') {
    return null // Will redirect to sign-in
  }

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Card className="w-96">
          <CardHeader>
            <CardTitle className="text-red-600">Error</CardTitle>
            <CardDescription>{error}</CardDescription>
          </CardHeader>
        </Card>
      </div>
    )
  }

  if (!data) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Card className="w-96">
          <CardHeader>
            <CardTitle>No Data</CardTitle>
            <CardDescription>
              No team data available. Please ensure users have connected their Slack accounts.
            </CardDescription>
          </CardHeader>
        </Card>
      </div>
    )
  }

  const formatMinutes = (minutes: number) => {
    const hours = Math.floor(minutes / 60)
    const mins = minutes % 60
    return hours > 0 ? `${hours}h ${mins}m` : `${mins}m`
  }

  const formatNameAsFirstName = (name: string | null) => {
    if (!name) return 'Unknown'
    const parts = name.trim().split(' ')
    return parts[0]
  }

  const formatUserLocalTime = (timezone: string | null) => {
    if (!timezone) return null
    
    try {
      const now = new Date()
      const userTime = new Intl.DateTimeFormat('en-US', {
        timeZone: timezone,
        hour: 'numeric',
        minute: '2-digit',
        hour12: true
      }).format(now)
      
      // Get timezone abbreviation if different from browser timezone
      const browserTimezone = Intl.DateTimeFormat().resolvedOptions().timeZone
      if (timezone === browserTimezone) {
        return userTime
      }
      
      // Try to get timezone abbreviation
      const zoneName = new Intl.DateTimeFormat('en-US', {
        timeZone: timezone,
        timeZoneName: 'short'
      }).formatToParts(now).find(part => part.type === 'timeZoneName')?.value || ''
      
      return `${userTime} ${zoneName}`
    } catch {
      // If timezone is invalid, return null
      return null
    }
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      <div className="container mx-auto px-4 py-8">
        {/* Header */}
        <div className="mb-8 flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-gray-900 dark:text-gray-100">
              Online
            </h1>
            <p className="text-gray-600 dark:text-gray-400 mt-2">
              See who&apos;s online and active right now
            </p>
          </div>
          
          <div className="flex items-center space-x-2">
            <Button 
              onClick={handleLogout}
              variant="outline"
              className="flex items-center space-x-2"
            >
              <LogOut className="h-4 w-4" />
              <span>Logout</span>
            </Button>
          </div>
        </div>

        {/* Dashboard Content */}
        <div className="w-full">
            {/* Online Team Members */}
            <Card className="mb-6">
              <CardHeader className="pb-3">
                <CardTitle className="flex items-center space-x-2 text-sm">
                  <Users className="h-4 w-4" />
                  <span>Currently Online ({data.filter(user => user.isOnline).length})</span>
                </CardTitle>
              </CardHeader>
              <CardContent className="pt-0">
                <div className="flex flex-wrap gap-2">
                  {data.filter(user => user.isOnline).map((user) => (
                    <div key={user.id} className="flex items-center space-x-2 bg-gray-50 dark:bg-gray-800 rounded-lg px-2 py-1">
                      <div className="relative">
                        {user.avatarUrl ? (
                          <img
                            src={user.avatarUrl}
                            alt={user.name || 'User'}
                            className="w-6 h-6 rounded-full"
                          />
                        ) : (
                          <div className="w-6 h-6 rounded-full bg-gray-300 dark:bg-gray-600 flex items-center justify-center">
                            <span className="text-xs font-medium">
                              {user.name?.[0]?.toUpperCase() || 'U'}
                            </span>
                          </div>
                        )}
                        <div className="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full border border-white bg-green-500" />
                      </div>
                      <span className="text-xs font-medium text-gray-700 dark:text-gray-300">
                        {formatNameAsFirstName(user.name)}
                      </span>
                    </div>
                  ))}
                  {data.filter(user => user.isOnline).length === 0 && (
                    <span className="text-sm text-gray-500 dark:text-gray-400">No team members currently online</span>
                  )}
                </div>
              </CardContent>
            </Card>

            {/* Team Overview Stats */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Total Users</CardTitle>
                  <Users className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">{data.length}</div>
                  <p className="text-xs text-muted-foreground">
                    {data.filter(user => user.isOnline).length} online now
                  </p>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Online Users</CardTitle>
                  <Activity className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">{data.filter(user => user.isOnline).length}</div>
                  <p className="text-xs text-muted-foreground">
                    {Math.round((data.filter(user => user.isOnline).length / data.length) * 100)}% of team
                  </p>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Total Activity</CardTitle>
                  <Clock className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">
                    {formatMinutes(data.reduce((sum, user) => sum + user.totalActiveMinutes, 0))}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Last 7 days
                  </p>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Avg per User</CardTitle>
                  <TrendingUp className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">
                    {formatMinutes(Math.round(data.reduce((sum, user) => sum + user.totalActiveMinutes, 0) / data.length))}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Weekly average
                  </p>
                </CardContent>
              </Card>
            </div>

            {/* Today's Overview */}
            <Card className="mb-6">
              <CardHeader>
                <CardTitle>Today&apos;s Activity Overview</CardTitle>
                <CardDescription>
                  Real-time presence timeline for all team members today
                </CardDescription>
              </CardHeader>
              <CardContent>
                {todayData ? (
                  <TodayOverview users={todayData} />
                ) : (
                  <div className="flex items-center justify-center py-8">
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* User Stats */}
            <Card>
              <CardHeader>
                <CardTitle>Team Member Activity</CardTitle>
                <CardDescription>
                  Individual activity breakdown for the past 7 days
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-6">
                  {data.map((user) => (
                    <div key={user.id} className="p-4 border rounded-lg space-y-4">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center space-x-4">
                          <div className="relative">
                            {user.avatarUrl ? (
                              <img
                                src={user.avatarUrl}
                                alt={user.name || 'User'}
                                className="w-10 h-10 rounded-full"
                              />
                            ) : (
                              <div className="w-10 h-10 rounded-full bg-gray-300 dark:bg-gray-600 flex items-center justify-center">
                                <span className="text-sm font-medium">
                                  {user.name?.[0]?.toUpperCase() || 'U'}
                                </span>
                              </div>
                            )}
                            <div className={`absolute -bottom-1 -right-1 w-3 h-3 rounded-full border-2 border-white ${
                              user.isOnline ? 'bg-green-500' : 'bg-gray-400'
                            }`} />
                          </div>
                          <div>
                            <div className="flex items-center space-x-3">
                              <p className="font-medium">{user.name || 'Unknown User'}</p>
                              {formatUserLocalTime(user.timezone) && (
                                <span className="text-sm font-mono text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/20 px-2 py-0.5 rounded">
                                  {formatUserLocalTime(user.timezone)}
                                </span>
                              )}
                            </div>
                            <p className="text-sm text-gray-600 dark:text-gray-400">
                              {user.isOnline ? 'Online' : 'Offline'}
                              {user.lastSeen && !user.isOnline && (
                                <span className="ml-2">
                                  Last seen: {new Date(user.lastSeen).toLocaleTimeString()}
                                </span>
                              )}
                            </p>
                          </div>
                        </div>
                        <div className="text-right">
                          <p className="font-medium">{formatMinutes(user.totalActiveMinutes)}</p>
                          <p className="text-sm text-gray-600 dark:text-gray-400">
                            Today: {formatMinutes(user.todayActiveMinutes)}
                          </p>
                        </div>
                      </div>
                      
                      {/* Timeline visualization */}
                      <div className="space-y-2">
                        <UserTimeline 
                          userId={user.id}
                          workdays={timelineData?.get(user.id)}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
        </div>
      </div>
    </div>
  )
}