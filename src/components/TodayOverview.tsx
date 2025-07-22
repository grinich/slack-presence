'use client'

import { useState, useMemo, memo, useEffect, useCallback, useRef } from 'react'
import { createPortal } from 'react-dom'
import { cn } from '@/lib/utils'

interface TimelineData {
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
  name: string
  avatarUrl: string | null
  timezone: string | null
  slackUserId: string
  timeline: TimelineData[]
  totalActiveMinutes: number
  messageCount: number
}

interface TodayOverviewProps {
  users: UserTodayData[]
  className?: string
}

function TodayOverview({ users, className }: TodayOverviewProps) {
  const [hoveredSlot, setHoveredSlot] = useState<{
    slot: TimelineData
    user: UserTodayData
    x: number
    y: number
  } | null>(null)
  
  const [currentTime, setCurrentTime] = useState(new Date())
  const hoverTimeoutRef = useRef<NodeJS.Timeout | null>(null)

  // Debounced hover handlers
  const handleSlotHover = useCallback((slot: TimelineData, user: UserTodayData, x: number, y: number) => {
    if (hoverTimeoutRef.current) {
      clearTimeout(hoverTimeoutRef.current)
    }
    hoverTimeoutRef.current = setTimeout(() => {
      setHoveredSlot({ slot, user, x, y })
    }, 100)
  }, [])

  const handleSlotHoverLeave = useCallback(() => {
    if (hoverTimeoutRef.current) {
      clearTimeout(hoverTimeoutRef.current)
    }
    setHoveredSlot(null)
  }, [])

  // Update current time every minute
  useEffect(() => {
    const updateTime = () => {
      setCurrentTime(new Date())
    }

    // Update immediately
    updateTime()

    // Set up interval to update every minute, aligned to the minute mark
    const now = new Date()
    const secondsToNextMinute = 60 - now.getSeconds()
    
    // First timeout to align with the next minute
    const alignmentTimeout = setTimeout(() => {
      updateTime()
      
      // Then set up regular interval every minute
      const interval = setInterval(updateTime, 60000)
      
      return () => clearInterval(interval)
    }, secondsToNextMinute * 1000)

    return () => {
      clearTimeout(alignmentTimeout)
    }
  }, [])

  // Memoize expensive functions
  const getStatusColor = useCallback((status: string, _onlinePercentage: number) => {
    switch (status) {
      case 'online':
        return 'bg-success'
      case 'offline':
        return 'bg-border'
      case 'no-data':
      default:
        return 'bg-muted'
    }
  }, [])

  const getStatusOpacity = useCallback((_status: string) => {
    // Always full opacity - no fading based on percentage
    return 'opacity-100'
  }, [])

  const formatTime = (hour: number, quarter: number) => {
    const ampm = hour >= 12 ? 'PM' : 'AM'
    const displayHour = hour === 0 ? 12 : hour > 12 ? hour - 12 : hour
    const minutes = quarter * 15
    return `${displayHour}:${minutes.toString().padStart(2, '0')}${ampm}`
  }

  const formatMinutes = (minutes: number) => {
    const hours = Math.floor(minutes / 60)
    const mins = minutes % 60
    return hours > 0 ? `${hours}h ${mins}m` : `${mins}m`
  }

  const formatAsSlackHandle = (slackUserId: string, name: string | null) => {
    if (!slackUserId) return name || 'Unknown'
    
    // For now, we'll create a simplified handle from the name
    // In the future, we can add an actual slackHandle field to the database
    if (name) {
      // Convert "John Doe" to "john.doe" as a reasonable Slack handle approximation
      const handle = name.toLowerCase()
        .replace(/[^a-zA-Z0-9\s]/g, '') // Remove special characters
        .trim()
        .split(/\s+/) // Split on whitespace
        .join('.') // Join with dots
        .substring(0, 20) // Limit length
      
      return `@${handle}`
    }
    
    // Fallback to a simplified version of the Slack ID
    return `@${slackUserId.substring(1, 8).toLowerCase()}`
  }

  const formatNameAsFirstNameLastInitial = (name: string | null) => {
    if (!name) return 'Unknown'
    const parts = name.trim().split(' ')
    if (parts.length === 1) return parts[0]
    const firstName = parts[0]
    const lastInitial = parts[parts.length - 1][0]?.toUpperCase()
    return lastInitial ? `${firstName} ${lastInitial}.` : firstName
  }

  const getTimezoneInfo = (timezone: string | null) => {
    if (!timezone) return { display: '', offsetMinutes: 0 }
    
    try {
      const now = new Date()
      
      // Calculate offset for sorting
      const userDate = new Date(now.toLocaleString('en-US', { timeZone: timezone }))
      const localDate = new Date(now.toLocaleString('en-US'))
      const diffMinutes = Math.round((userDate.getTime() - localDate.getTime()) / (1000 * 60))
      
      // Display just the offset
      let display = ''
      if (diffMinutes === 0) {
        display = 'Local'
      } else {
        const sign = diffMinutes > 0 ? '+' : '-'
        const absDiffMinutes = Math.abs(diffMinutes)
        const hours = Math.floor(absDiffMinutes / 60)
        const minutes = absDiffMinutes % 60
        
        if (minutes === 0) {
          display = `${sign}${hours}hr`
        } else {
          display = `${sign}${hours}:${minutes.toString().padStart(2, '0')}`
        }
      }
      
      return { display, offsetMinutes: diffMinutes }
    } catch (error) {
      console.error('Error getting timezone info:', error)
      return { display: '?', offsetMinutes: 0 }
    }
  }

  // Calculate current time position for the new red line indicator
  const currentTimePosition = useMemo(() => {
    const currentHour = currentTime.getHours()
    const currentMinute = currentTime.getMinutes()
    
    // Calculate exact position as percentage within 24-hour timeline
    const totalMinutesInDay = 24 * 60 // 1440 minutes
    const currentMinutesFromStart = currentHour * 60 + currentMinute
    const percentage = (currentMinutesFromStart / totalMinutesInDay) * 100
    
    return percentage
  }, [currentTime])
  
  // Format current time for the label
  const currentTimeLabel = currentTime.toLocaleTimeString('en-US', { 
    hour: 'numeric', 
    minute: '2-digit',
    hour12: true 
  })

  // Memoize expensive filtering and sorting operations
  const sortedUsers = useMemo(() => {
    // Filter out "Team Analytics" user and sort by timezone offset
    const filteredUsers = users.filter(user => 
      user.name && !user.name.toLowerCase().includes('team analytics')
    )
    
    return [...filteredUsers].sort((a, b) => {
      const aOffset = getTimezoneInfo(a.timezone).offsetMinutes
      const bOffset = getTimezoneInfo(b.timezone).offsetMinutes
      return aOffset - bOffset
    })
  }, [users])

  return (
    <div className={cn("space-y-3", className)}>
      {/* Legend */}
      <div className="flex items-center gap-6 text-xs text-muted-foreground pb-4">
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 bg-success rounded" />
          <span>Online</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 bg-border rounded" />
          <span>Away</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 bg-muted rounded" />
          <span>No Data</span>
        </div>
      </div>

      {/* Header with time labels */}
      <div className="flex items-center gap-3 pb-2">
        <div className="w-24 flex-shrink-0" />
        <div className="w-12 flex-shrink-0" />
        <div className="flex justify-between text-xs text-muted-foreground flex-1 font-mono">
          <span>12AM</span>
          <span>4AM</span>
          <span>8AM</span>
          <span>12PM</span>
          <span>4PM</span>
          <span>8PM</span>
          <span>11:59PM</span>
        </div>
        <div className="w-16 text-xs text-muted-foreground font-medium text-right flex-shrink-0">
          Active
        </div>
      </div>

      {/* Timeline container with current time indicator */}
      <div className="relative">
        {/* User timeline rows */}
        <div className="space-y-1">
          {sortedUsers.map((user) => {
            const timezoneInfo = getTimezoneInfo(user.timezone)
            return (
              <div key={user.id} className="flex items-center gap-3 hover:bg-accent/30 transition-all duration-200 rounded-lg px-2 py-1 group">
                {/* User name */}
                <div className="w-24 flex-shrink-0 text-sm font-medium text-card-foreground group-hover:text-foreground text-right transition-colors">
                  {formatNameAsFirstNameLastInitial(user.name)}
                </div>
                
                {/* Timezone offset */}
                <div className="w-12 flex-shrink-0 text-xs text-muted-foreground font-mono text-center">
                  {timezoneInfo.display}
                </div>
              
                {/* Timeline blocks */}
                <div className="flex items-center flex-1 relative h-5">
                  {(() => {
                    const visibleSlots = user.timeline // Show full 24 hours
                    return visibleSlots.map((slot) => {
                      return (
                        <div
                          key={slot.blockIndex}
                          className={cn(
                            "h-5 cursor-pointer transition-all hover:scale-105 hover:ring-1 hover:ring-ring/50 flex-1 min-w-0 rounded-sm",
                            getStatusColor(slot.status, slot.onlinePercentage),
                            getStatusOpacity(slot.status)
                          )}
                          onMouseEnter={(e) => {
                            const rect = e.currentTarget.getBoundingClientRect()
                            handleSlotHover(slot, user, rect.left + rect.width / 2, rect.top - 40)
                          }}
                          onMouseLeave={handleSlotHoverLeave}
                        />
                      )
                    })
                  })()}
                </div>
                
                {/* Daily total time */}
                <div className="w-16 text-sm text-muted-foreground group-hover:text-foreground font-medium text-right flex-shrink-0 transition-colors">
                  {formatMinutes(user.totalActiveMinutes)}
                </div>
              </div>
            )
          })}
        </div>
        
        {/* NEW: Red vertical current time line spanning all rows */}
        <div
          className="absolute top-0 bottom-0 w-0.5 bg-red-500 z-20 pointer-events-none"
          style={{
            left: `calc(6rem + 3rem + 0.75rem + 0.75rem + (100% - 6rem - 3rem - 4rem - 2.25rem) * ${currentTimePosition / 100})`,
            // 6rem = user handle width
            // 3rem = timezone width  
            // 0.75rem * 2 = gaps
            // 4rem = daily total width
            // 0.75rem = final gap
          }}
        >
          {/* Current time label at the top */}
          <div className="absolute -top-7 left-1/2 transform -translate-x-1/2 bg-white border border-red-500 text-red-500 text-xs font-semibold px-2 py-1 rounded whitespace-nowrap shadow-sm">
            {currentTimeLabel}
          </div>
        </div>
      </div>

      {/* Custom tooltip */}
      {hoveredSlot && typeof document !== 'undefined' && createPortal(
        <div
          className="fixed z-50 bg-card border border-border text-card-foreground text-xs px-3 py-2 rounded-lg shadow-lg pointer-events-none animate-fade-in"
          style={{
            left: hoveredSlot.x,
            top: hoveredSlot.y,
            transform: 'translateX(-50%)'
          }}
        >
          {(() => {
            const startTime = formatTime(hoveredSlot.slot.hour, hoveredSlot.slot.quarter)
            let endHour = hoveredSlot.slot.hour
            let endMinutes = (hoveredSlot.slot.quarter + 1) * 15
            if (endMinutes >= 60) {
              endHour += 1
              endMinutes = 0
            }
            const endQuarter = Math.floor(endMinutes / 15)
            const endTime = formatTime(endHour, endQuarter)
            
            return `${formatNameAsFirstNameLastInitial(hoveredSlot.user.name)} ${startTime} - ${endTime}${hoveredSlot.slot.hasMessages ? ` • ${hoveredSlot.slot.messageCount} messages` : ''}`
          })()}
        </div>,
        document.body
      )}
    </div>
  )
}

export default memo(TodayOverview)