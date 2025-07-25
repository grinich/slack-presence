'use client'

import { useEffect, useState, useCallback, useMemo, useRef } from 'react'
import { useSession } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { createPortal } from 'react-dom'
import { Card, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Users, Clock, Activity, TrendingUp, LogOut, Calendar } from 'lucide-react'
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


interface PresenceBlock {
  hour: number
  quarter: number
  blockIndex: number
  status: 'online' | 'offline' | 'no-data'
  onlinePercentage: number
  activeMinutes: number
  totalMinutes: number
  messageCount: number
  hasMessages: boolean
  blockStart: string // UTC ISO string
  blockEnd: string // UTC ISO string
}



interface UserTodayData {
  id: string
  name: string | null
  avatarUrl: string | null
  timezone: string | null
  slackUserId: string
  timeline: PresenceBlock[]
  totalActiveMinutes: number
  messageCount: number
  isCurrentlyOnline: boolean
  lastActiveTime: string | null
}


export default function AuthenticatedDashboard() {
  const { status } = useSession()
  const router = useRouter()
  const [data, setData] = useState<UserStats[] | null>(null)
  const [todayData, setTodayData] = useState<UserTodayData[] | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [rateLimited, setRateLimited] = useState<boolean>(false)
  const lastRefreshRef = useRef<number>(0)
  const isRefreshingRef = useRef<boolean>(false)
  const [hoveredUser, setHoveredUser] = useState<{
    user: UserTodayData
    x: number
    y: number
  } | null>(null)
  const [selectedDate, setSelectedDate] = useState<Date>(new Date())
  const hoverTimeoutRef = useRef<NodeJS.Timeout | null>(null)
  const activeRequestRef = useRef<Promise<void> | null>(null)

  // Redirect to sign-in if not authenticated
  useEffect(() => {
    if (status === 'unauthenticated') {
      router.push('/auth/signin')
    }
  }, [status, router])

  // Unified fetch function using new API
  const fetchDataForDate = useCallback(async (targetDate: Date, force = false) => {
    if (status !== 'authenticated') return
    
    // Skip if already refreshing to prevent concurrent requests
    if (isRefreshingRef.current && !force) {
      return
    }
    
    // Skip refresh if not enough time has passed (unless forced)
    const now = Date.now()
    if (!force && now - lastRefreshRef.current < 25000) { // 25 second minimum
      return
    }
    
    // Prevent concurrent requests - if one is in flight, wait for it
    if (activeRequestRef.current && !force) {
      return activeRequestRef.current
    }
    
    // Create and store the request promise
    const requestPromise = (async () => {
      try {
        // Mark as refreshing to prevent concurrent requests
        isRefreshingRef.current = true
        lastRefreshRef.current = now
        
        // Calculate selected date boundaries in local timezone
        const year = targetDate.getFullYear()
        const month = targetDate.getMonth()
        const date = targetDate.getDate()
        
        // Create date boundaries in local timezone 
        const userDateStart = new Date(year, month, date, 0, 0, 0, 0)
        const userDateEnd = new Date(year, month, date, 23, 59, 59, 999)
        
        // Always ensure we include current time for real-time data
        const currentTime = new Date()
        const isToday = targetDate.toDateString() === currentTime.toDateString()
        
        if (isToday) {
          // Extend the end time to include current time plus buffer
          const extendedEnd = new Date(currentTime.getTime() + 60 * 60 * 1000) // 1 hour buffer
          if (extendedEnd > userDateEnd) {
            userDateEnd.setTime(extendedEnd.getTime())
          }
        }
        
        // Fetch all data from unified API
        const response = await fetch(`/api/dashboard/presence-data?start=${userDateStart.toISOString()}&end=${userDateEnd.toISOString()}`)
        const result = await response.json()
        
        if (result.success) {
          const presenceData = result.data
          
          // Transform to UserStats format for existing components
          const transformedData: UserStats[] = presenceData.map((user: UserTodayData) => ({
            id: user.id,
            name: user.name || 'Unknown',
            avatarUrl: user.avatarUrl,
            timezone: user.timezone,
            totalActiveMinutes: user.totalActiveMinutes,
            todayActiveMinutes: user.totalActiveMinutes,
            lastSeen: null,
            isOnline: user.isCurrentlyOnline
          }))
          
          // Transform to UserTodayData format for existing components
          const todayData: UserTodayData[] = presenceData.map((user: UserTodayData) => ({
            id: user.id,
            name: user.name,
            avatarUrl: user.avatarUrl,
            timezone: user.timezone,
            slackUserId: user.slackUserId,
            timeline: user.timeline,
            totalActiveMinutes: user.totalActiveMinutes,
            messageCount: user.messageCount,
            isCurrentlyOnline: user.isCurrentlyOnline,
            lastActiveTime: user.lastActiveTime
          }))
          
          setData(transformedData)
          setTodayData(todayData)
          
        } else {
          // Check if this is a rate limiting issue
          if (result.error === 'ratelimited' || result.error?.includes('rate limit')) {
            setRateLimited(true)
            setError('Slack API rate limited - using cached data')
          } else {
            setError(result.error || 'Failed to fetch data')
          }
        }
      } catch (err) {
        // Check if the error response indicates rate limiting
        if (err instanceof Error && err.message.includes('429')) {
          setRateLimited(true)
          setError('Slack API rate limited - using cached data')
        } else {
          setError('Network error')
        }
      } finally {
        setLoading(false)
        isRefreshingRef.current = false
      }
    })()
    
    // Store the active request and return it
    activeRequestRef.current = requestPromise
    return requestPromise
  }, [status])

  useEffect(() => {
    if (status !== 'authenticated') return

    // Initial fetch
    fetchDataForDate(selectedDate, true) // Force initial load

    // Auto-refresh every 30 seconds at the 15-second mark (offset from timeline)
    const now = new Date()
    const secondsToWait = 15 - (now.getSeconds() % 30)
    const timeToFirstRefresh = secondsToWait <= 0 ? 30 + secondsToWait : secondsToWait
    
    let refreshInterval: NodeJS.Timeout | null = null
    
    // First refresh aligned to 15-second mark
    const firstTimeout = setTimeout(() => {
      fetchDataForDate(selectedDate)
      
      // Then refresh every 30 seconds
      refreshInterval = setInterval(() => {
        fetchDataForDate(selectedDate)
      }, 30000)
    }, timeToFirstRefresh * 1000)

    return () => {
      clearTimeout(firstTimeout)
      if (refreshInterval) {
        clearInterval(refreshInterval)
      }
    }
  }, [status, selectedDate, fetchDataForDate])

  // Separate effect for date changes - force immediate refresh
  useEffect(() => {
    if (status === 'authenticated') {
      fetchDataForDate(selectedDate, true)
    }
  }, [selectedDate, status, fetchDataForDate])



  const handleLogout = useCallback(async () => {
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
  }, [router])

  // Debounced hover handlers to reduce lag
  const handleUserHover = useCallback((user: UserTodayData, x: number, y: number) => {
    if (hoverTimeoutRef.current) {
      clearTimeout(hoverTimeoutRef.current)
    }
    hoverTimeoutRef.current = setTimeout(() => {
      setHoveredUser({ user, x, y })
    }, 150)
  }, [])

  const handleUserHoverLeave = useCallback(() => {
    if (hoverTimeoutRef.current) {
      clearTimeout(hoverTimeoutRef.current)
    }
    setHoveredUser(null)
  }, [])

  // Memoized expensive computations
  const memoizedStats = useMemo(() => {
    if (!data) return null
    
    const onlineUsers = data.filter(user => user.isOnline)
    const totalActiveMinutes = data.reduce((sum, user) => sum + user.totalActiveMinutes, 0)
    const averageActiveMinutes = Math.round(totalActiveMinutes / data.length)
    
    return {
      totalUsers: data.length,
      onlineCount: onlineUsers.length,
      onlinePercentage: Math.round((onlineUsers.length / data.length) * 100),
      totalActiveMinutes,
      averageActiveMinutes
    }
  }, [data])

  const memoizedCurrentlyOnlineUsers = useMemo(() => {
    return todayData?.filter(user => user.isCurrentlyOnline) || []
  }, [todayData])


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

  const formatNameAsFirstNameLastInitial = (name: string | null) => {
    if (!name) return 'Unknown'
    const parts = name.trim().split(' ')
    if (parts.length === 1) return parts[0]
    const firstName = parts[0]
    const lastInitial = parts[parts.length - 1][0]?.toUpperCase()
    return lastInitial ? `${firstName} ${lastInitial}.` : firstName
  }


  const formatLastSeen = (lastActiveTime: string | null, totalActiveMinutes: number) => {
    if (!lastActiveTime) {
      return totalActiveMinutes === 0 ? 'No activity data available' : 'Never seen active'
    }
    
    const lastActive = new Date(lastActiveTime)
    const now = new Date()
    const diffMs = now.getTime() - lastActive.getTime()
    const diffMinutes = Math.floor(diffMs / (1000 * 60))
    
    if (diffMinutes < 1) {
      return 'Active now'
    } else if (diffMinutes < 60) {
      return `Last seen ${diffMinutes} minute${diffMinutes === 1 ? '' : 's'} ago`
    } else {
      const diffHours = Math.floor(diffMinutes / 60)
      if (diffHours < 24) {
        return `Last seen ${diffHours} hour${diffHours === 1 ? '' : 's'} ago`
      } else {
        const diffDays = Math.floor(diffHours / 24)
        if (diffDays < 7) {
          return `Last seen ${diffDays} day${diffDays === 1 ? '' : 's'} ago`
        } else {
          return `Last seen ${lastActive.toLocaleDateString()} at ${lastActive.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`
        }
      }
    }
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Rate Limiting Banner */}
      {rateLimited && (
        <div className="bg-amber-50 border-b border-amber-200 px-6 py-3">
          <div className="max-w-7xl mx-auto flex items-center gap-3">
            <div className="flex-shrink-0">
              <svg className="w-5 h-5 text-amber-600" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
              </svg>
            </div>
            <div className="flex-1">
              <p className="text-sm text-amber-800">
                <strong>Slack API Rate Limited:</strong> Showing cached data. Live updates will resume when rate limits reset (typically within 1 hour).
              </p>
            </div>
            <button 
              onClick={() => setRateLimited(false)}
              className="flex-shrink-0 text-amber-600 hover:text-amber-800 transition-colors"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>
      )}
      
      <div className="max-w-7xl mx-auto px-6 py-12">
        {/* Header */}
        <div className="mb-12 flex items-start justify-between">
          <div>
            <h1 className="text-4xl font-semibold tracking-tight text-foreground mb-3">
              Presence
            </h1>
            <p className="text-lg text-muted-foreground max-w-md">
              Real-time team activity and online status
            </p>
          </div>
          
          <Button 
            onClick={handleLogout}
            variant="ghost"
            size="sm"
            className="text-muted-foreground hover:text-foreground transition-colors"
          >
            <LogOut className="h-4 w-4 mr-2" />
            Sign out
          </Button>
        </div>

        {/* Dashboard Content */}
        <div className="space-y-8">
            {/* Online Team Members */}
            <div className="space-y-4">
              <div className="flex items-center gap-3">
                <div className="h-2 w-2 rounded-full bg-success animate-pulse-subtle" />
                <h2 className="text-xl font-medium text-foreground">
                  {selectedDate.toDateString() === new Date().toDateString() 
                    ? `Online now`
                    : `Active on ${selectedDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`
                  }
                </h2>
                <span className="text-sm text-muted-foreground font-mono">
                  {memoizedCurrentlyOnlineUsers.length}
                </span>
              </div>
              
              <div className="flex flex-wrap gap-3 min-h-[3rem] items-start">
                {memoizedCurrentlyOnlineUsers.map((user) => (
                  <Link
                    key={user.id}
                    href={`/user/${user.id}`}
                    className="group flex items-center gap-3 bg-card border border-border rounded-xl px-4 py-3 cursor-pointer hover:bg-accent/50 transition-all duration-200 hover:scale-105 animate-fade-in"
                    onMouseEnter={(e) => {
                      const rect = e.currentTarget.getBoundingClientRect()
                      handleUserHover(user, rect.left + rect.width / 2, rect.top - 10)
                    }}
                    onMouseLeave={handleUserHoverLeave}
                  >
                    <div className="relative">
                      {user.avatarUrl ? (
                        <img
                          src={user.avatarUrl}
                          alt={user.name || 'User'}
                          className="w-8 h-8 rounded-full ring-2 ring-success/20"
                        />
                      ) : (
                        <div className="w-8 h-8 rounded-full bg-muted flex items-center justify-center ring-2 ring-success/20">
                          <span className="text-sm font-medium text-muted-foreground">
                            {user.name?.[0]?.toUpperCase() || 'U'}
                          </span>
                        </div>
                      )}
                      <div className="absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full border-2 border-card bg-success" />
                    </div>
                    <span className="text-sm font-medium text-card-foreground group-hover:text-foreground transition-colors">
                      {formatNameAsFirstNameLastInitial(user.name)}
                    </span>
                  </Link>
                ))}
                {memoizedCurrentlyOnlineUsers.length === 0 && (
                  <div className="flex items-center gap-2 text-muted-foreground bg-muted/30 rounded-lg px-4 py-3">
                    <div className="h-2 w-2 rounded-full bg-muted-foreground opacity-50" />
                    <span className="text-sm">No one online right now</span>
                  </div>
                )}
              </div>
            </div>

            {/* Team Overview Stats */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-6">
              <div className="bg-card border border-border rounded-2xl p-6 hover:bg-accent/30 transition-colors">
                <div className="flex items-center justify-between mb-4">
                  <Users className="h-5 w-5 text-muted-foreground" />
                  <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Team</span>
                </div>
                <div className="space-y-1">
                  <div className="text-3xl font-semibold text-foreground">{memoizedStats?.totalUsers || 0}</div>
                  <p className="text-sm text-muted-foreground">
                    {memoizedStats?.onlineCount || 0} active
                  </p>
                </div>
              </div>

              <div className="bg-card border border-border rounded-2xl p-6 hover:bg-accent/30 transition-colors">
                <div className="flex items-center justify-between mb-4">
                  <Activity className="h-5 w-5 text-success" />
                  <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Online</span>
                </div>
                <div className="space-y-1">
                  <div className="text-3xl font-semibold text-foreground">{memoizedStats?.onlineCount || 0}</div>
                  <p className="text-sm text-muted-foreground">
                    {memoizedStats?.onlinePercentage || 0}% of team
                  </p>
                </div>
              </div>

              <div className="bg-card border border-border rounded-2xl p-6 hover:bg-accent/30 transition-colors">
                <div className="flex items-center justify-between mb-4">
                  <Clock className="h-5 w-5 text-muted-foreground" />
                  <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Activity</span>
                </div>
                <div className="space-y-1">
                  <div className="text-3xl font-semibold text-foreground">
                    {formatMinutes(memoizedStats?.totalActiveMinutes || 0)}
                  </div>
                  <p className="text-sm text-muted-foreground">
                    Past 7 days
                  </p>
                </div>
              </div>

              <div className="bg-card border border-border rounded-2xl p-6 hover:bg-accent/30 transition-colors">
                <div className="flex items-center justify-between mb-4">
                  <TrendingUp className="h-5 w-5 text-muted-foreground" />
                  <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Average</span>
                </div>
                <div className="space-y-1">
                  <div className="text-3xl font-semibold text-foreground">
                    {formatMinutes(memoizedStats?.averageActiveMinutes || 0)}
                  </div>
                  <p className="text-sm text-muted-foreground">
                    Per person
                  </p>
                </div>
              </div>
            </div>

            {/* Activity Timeline */}
            <div className="bg-card border border-border rounded-2xl overflow-hidden">
              <div className="p-6 border-b border-border">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="text-lg font-medium text-foreground">Activity Timeline</h3>
                    <p className="text-sm text-muted-foreground mt-1">
                      Real-time presence data for the entire team
                    </p>
                  </div>
                  <div className="flex items-center gap-3">
                    <Calendar className="h-4 w-4 text-muted-foreground" />
                    <input
                      type="date"
                      value={selectedDate.getFullYear() + '-' + 
                             String(selectedDate.getMonth() + 1).padStart(2, '0') + '-' + 
                             String(selectedDate.getDate()).padStart(2, '0')}
                      onChange={(e) => {
                        const [year, month, day] = e.target.value.split('-').map(Number)
                        setSelectedDate(new Date(year, month - 1, day))
                      }}
                      className="px-3 py-2 border border-border rounded-lg text-sm bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:border-transparent transition-all"
                    />
                  </div>
                </div>
              </div>
              
              <div className="p-6">
                {todayData ? (
                  <TodayOverview users={todayData} />
                ) : (
                  <div className="flex items-center justify-center py-12">
                    <div className="flex items-center gap-3 text-muted-foreground">
                      <div className="animate-spin rounded-full h-6 w-6 border-2 border-muted-foreground border-t-transparent"></div>
                      <span className="text-sm">Loading timeline...</span>
                    </div>
                  </div>
                )}
              </div>
            </div>

        </div>
      </div>

      {/* Custom Tooltip */}
      {hoveredUser && typeof document !== 'undefined' && createPortal(
        <div
          className="fixed z-50 bg-card border border-border text-card-foreground text-xs px-3 py-2 rounded-lg shadow-lg pointer-events-none animate-fade-in"
          style={{
            left: hoveredUser.x,
            top: hoveredUser.y,
            transform: 'translateX(-50%)'
          }}
        >
          {formatLastSeen(hoveredUser.user.lastActiveTime, hoveredUser.user.totalActiveMinutes)}
        </div>,
        document.body
      )}
    </div>
  )
}