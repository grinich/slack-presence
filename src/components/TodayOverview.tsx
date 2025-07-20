'use client'

import { useState, useMemo, memo, useEffect } from 'react'
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

  const getStatusColor = (status: string, onlinePercentage: number) => {
    switch (status) {
      case 'online':
        return 'bg-[lab(62.79_-40.35_11.7)]'  // Custom LAB green
      case 'offline':
        return 'bg-gray-200'     // Slightly lighter gray for offline/away
      case 'no-data':
      default:
        return 'bg-gray-100'     // Softer light gray for no data
    }
  }

  const getStatusOpacity = (status: string) => {
    // Always full opacity - no fading based on percentage
    return 'opacity-100'
  }

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

  const formatNameAsFirstName = (name: string | null) => {
    if (!name) return 'Unknown'
    const parts = name.trim().split(' ')
    return parts[0]
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

  // Calculate current time position for the shared vertical indicator
  const getCurrentTimePosition = () => {
    const currentHour = currentTime.getHours()
    const currentMinute = currentTime.getMinutes()
    
    // Skip if current time is in hidden hours (0-4)
    if (currentHour < 5) return null
    
    // Timeline shows hours 5-23 (5AM to 11:59PM)
    // Calculate position within just the visible hours
    const visibleStartHour = 5
    const visibleEndHour = 23 // 11PM
    const totalVisibleHours = visibleEndHour - visibleStartHour + 1 // 19 hours (5AM through 11PM)
    
    // Calculate current position within visible hours
    const hoursFromStart = currentHour - visibleStartHour
    const minutesFromStart = hoursFromStart * 60 + currentMinute
    const totalVisibleMinutes = totalVisibleHours * 60 // 19 hours * 60 minutes
    
    // Calculate percentage position within the visible timeline
    const position = (minutesFromStart / totalVisibleMinutes) * 100
    
    // Current time position calculated
    
    return position
  }

  const currentTimePosition = useMemo(() => getCurrentTimePosition(), [])

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
      <div className="flex items-center space-x-3 text-xs text-gray-600 pb-2">
        <div className="flex items-center space-x-1">
          <div className="w-2 h-2 bg-[lab(62.79_-40.35_11.7)] rounded-sm" />
          <span>Online</span>
        </div>
        <div className="flex items-center space-x-1">
          <div className="w-2 h-2 bg-gray-200 rounded-sm" />
          <span>Away</span>
        </div>
        <div className="flex items-center space-x-1">
          <div className="w-2 h-2 bg-gray-100 rounded-sm" />
          <span>No Data</span>
        </div>
      </div>

      {/* Header with time labels */}
      <div className="flex items-center space-x-2">
        <div className="w-20 flex-shrink-0" /> {/* Space for names */}
        <div className="w-12 flex-shrink-0" /> {/* Space for timezone */}
        <div className="flex justify-between text-xs text-gray-500 flex-1">
          <span>5AM</span>
          <span>9AM</span>
          <span>1PM</span>
          <span>5PM</span>
          <span>9PM</span>
          <span>11:59PM</span>
        </div>
        <div className="w-12 text-xs text-gray-500 font-medium text-right flex-shrink-0">
          Hours
        </div>
      </div>

      {/* User timeline rows */}
      <div className="relative" style={{gap: '2px', display: 'flex', flexDirection: 'column'}}>
        {sortedUsers.map((user) => {
          const timezoneInfo = getTimezoneInfo(user.timezone)
          return (
            <div key={user.id} className="flex items-center space-x-2 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors duration-150 rounded px-1 group">
              {/* User name */}
              <div className="w-20 flex-shrink-0 text-xs text-gray-700 dark:text-gray-300 group-hover:text-gray-900 dark:group-hover:text-gray-100 font-medium text-right pr-2 transition-colors duration-150">
                {formatNameAsFirstName(user.name)}
              </div>
              
              {/* Timezone offset */}
              <div className="w-12 flex-shrink-0 text-xs text-gray-500 group-hover:text-gray-700 dark:group-hover:text-gray-300 font-mono text-center transition-colors duration-150">
                {timezoneInfo.display}
              </div>
            
            {/* Timeline blocks */}
            <div className="flex items-center flex-1 relative h-4">
              {(() => {
                const visibleSlots = user.timeline.filter(slot => slot.hour >= 5) // Show 5AM-11:59PM
                return visibleSlots.map((slot) => {
                  const startTime = formatTime(slot.hour, slot.quarter)
                  
                  // Calculate end time (15 minutes later)
                  let endHour = slot.hour
                  let endMinutes = (slot.quarter + 1) * 15
                  if (endMinutes >= 60) {
                    endHour += 1
                    endMinutes = 0
                  }
                  const endQuarter = Math.floor(endMinutes / 15)
                  const endTime = formatTime(endHour, endQuarter)
                  
                  return (
                    <div
                      key={slot.blockIndex}
                      className={cn(
                        "h-4 cursor-pointer transition-all hover:scale-110 flex-1 min-w-0 relative",
                        getStatusColor(slot.status, slot.onlinePercentage),
                        getStatusOpacity(slot.status)
                      )}
                      onMouseEnter={(e) => {
                        const rect = e.currentTarget.getBoundingClientRect()
                        setHoveredSlot({
                          slot,
                          user,
                          x: rect.left + rect.width / 2,
                          y: rect.top - 40
                        })
                      }}
                      onMouseLeave={() => setHoveredSlot(null)}
                    />
                  )
                })
              })()}
            </div>
            
            {/* Daily total time */}
            <div className="w-12 text-xs text-gray-600 group-hover:text-gray-800 dark:group-hover:text-gray-200 font-medium text-right flex-shrink-0 transition-colors duration-150">
              {formatMinutes(user.totalActiveMinutes)}
              </div>
            </div>
          )
        })}
        
        {/* Shared vertical current time indicator that spans all rows */}
        {currentTimePosition !== null && (
          <div
            className="absolute top-0 bottom-0 w-px bg-red-400 z-10 pointer-events-none"
            style={{
              left: `calc(9rem + (100% - 12.5rem) * ${currentTimePosition / 100})`, 
              // 9rem = name(5rem) + gap(0.5rem) + timezone(3rem) + gap(0.5rem)
              // 12.5rem = total fixed width including hours column(3rem) and final gap(0.5rem)  
              // (100% - 12.5rem) = actual timeline area width
              // currentTimePosition/100 = percentage as decimal within timeline area
            }}
          >
            {/* Current time display */}
            <div className="absolute -top-8 left-1/2 transform -translate-x-1/2 text-xs font-medium text-red-600 bg-red-50 px-2 py-1 rounded-lg whitespace-nowrap border border-red-100">
              {currentTime.toLocaleTimeString('en-US', { 
                hour: 'numeric', 
                minute: '2-digit',
                hour12: true 
              })}
            </div>
            {/* Top indicator */}
            <div className="absolute -top-2 left-1/2 transform -translate-x-1/2 w-2 h-2 bg-red-400 rounded-full" />
            {/* Bottom indicator */}
            <div className="absolute -bottom-2 left-1/2 transform -translate-x-1/2 w-2 h-2 bg-red-400 rounded-full" />
          </div>
        )}
      </div>

      {/* Custom tooltip */}
      {hoveredSlot && typeof document !== 'undefined' && createPortal(
        <div
          className="fixed z-50 bg-gray-900 text-white text-xs px-2 py-1 rounded shadow-lg pointer-events-none"
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
            
            return `${formatNameAsFirstName(hoveredSlot.user.name)} ${startTime} - ${endTime} (${hoveredSlot.slot.activeMinutes}/15 minutes)${hoveredSlot.slot.hasMessages ? ` • ${hoveredSlot.slot.messageCount} messages` : ''}`
          })()}
        </div>,
        document.body
      )}
    </div>
  )
}

export default memo(TodayOverview)