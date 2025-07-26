'use client'

import { useEffect, useState, memo, useCallback, useRef } from 'react'
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
  blockStart: string
  blockEnd: string
}

interface WorkdayData {
  date: string
  dayName: string
  dayShort: string
  timeline: TimelineData[]
  messageCount: number
}

interface UserTimelineProps {
  userId: string
  className?: string
  workdays?: WorkdayData[] // Pre-fetched workdays data
}

function UserTimeline({ userId, className, workdays: preFetchedWorkdays }: UserTimelineProps) {
  const [workdays, setWorkdays] = useState<WorkdayData[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [hoveredSlot, setHoveredSlot] = useState<{
    slot: TimelineData
    workday: WorkdayData
    x: number
    y: number
  } | null>(null)
  
  const [currentTime, setCurrentTime] = useState(new Date())
  const hoverTimeoutRef = useRef<NodeJS.Timeout | null>(null)

  // Debounced hover handlers
  const handleSlotHover = useCallback((slot: TimelineData, workday: WorkdayData, x: number, y: number) => {
    if (hoverTimeoutRef.current) {
      clearTimeout(hoverTimeoutRef.current)
    }
    hoverTimeoutRef.current = setTimeout(() => {
      setHoveredSlot({ slot, workday, x, y })
    }, 100)
  }, [])

  const handleSlotHoverLeave = useCallback(() => {
    if (hoverTimeoutRef.current) {
      clearTimeout(hoverTimeoutRef.current)
    }
    setHoveredSlot(null)
  }, [])

  // Memoized helper functions
  const getStatusColor = useCallback((_status: string, _onlinePercentage: number) => {
    switch (_status) {
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

  const formatTime = useCallback((hour: number, quarter: number) => {
    const ampm = hour >= 12 ? 'PM' : 'AM'
    const displayHour = hour === 0 ? 12 : hour > 12 ? hour - 12 : hour
    const minutes = quarter * 15
    return `${displayHour}:${minutes.toString().padStart(2, '0')}${ampm}`
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

  useEffect(() => {
    // If we have pre-fetched data, use it instead of making API calls
    if (preFetchedWorkdays) {
      setWorkdays(preFetchedWorkdays)
      setLoading(false)
      return
    }

    async function fetchTimeline() {
      try {
        const params = new URLSearchParams({ userId })
        
        const response = await fetch(`/api/dashboard/user-timeline?${params}`)
        const result = await response.json()
        
        if (result.success) {
          setWorkdays(result.data.workdays)
        } else {
          setError(result.error || 'Failed to fetch timeline')
        }
      } catch {
        setError('Network error')
      } finally {
        setLoading(false)
      }
    }

    // Only fetch if no pre-fetched data
    fetchTimeline()

    // Auto-refresh every minute at the 30-second mark (only if no pre-fetched data)
    const now = new Date()
    const secondsToWait = 30 - (now.getSeconds() % 60)
    const timeToFirstRefresh = secondsToWait <= 0 ? 60 + secondsToWait : secondsToWait
    
    let refreshInterval: NodeJS.Timeout | null = null
    
    // First refresh aligned to 30-second mark
    const firstTimeout = setTimeout(() => {
      fetchTimeline()
      
      // Then refresh every 60 seconds
      refreshInterval = setInterval(() => {
        fetchTimeline()
      }, 60000)
    }, timeToFirstRefresh * 1000)

    return () => {
      clearTimeout(firstTimeout)
      if (refreshInterval) {
        clearInterval(refreshInterval)
      }
    }
  }, [userId, preFetchedWorkdays])

  if (loading) {
    return (
      <div className={cn("space-y-2", className)}>
        {Array.from({ length: 7 }, (_, dayIndex) => (
          <div key={dayIndex} className="flex items-center space-x-2">
            <div className="w-8 h-4 bg-gray-200 animate-pulse rounded-sm" />
            <div className="flex space-x-0.5">
              {Array.from({ length: 96 }, (_, i) => ( // 24 hours * 4 quarters = 96 blocks
                <div key={i} className="w-1 h-4 bg-gray-200 animate-pulse rounded-sm" />
              ))}
            </div>
          </div>
        ))}
      </div>
    )
  }

  if (error) {
    return (
      <div className={cn("text-xs text-red-500", className)}>
        Failed to load timeline
      </div>
    )
  }

  const isCurrentTimeSlot = (date: string, hour: number, quarter: number) => {
    const now = currentTime
    
    // Parse the date string as local date to avoid timezone issues
    const dateParts = date.split('-')
    const year = parseInt(dateParts[0])
    const month = parseInt(dateParts[1])
    const day = parseInt(dateParts[2])
    const slotDate = new Date(year, month - 1, day) // month is 0-indexed in Date constructor
    
    // More robust date comparison - compare year, month, day in LOCAL timezone
    const nowYear = now.getFullYear()
    const nowMonth = now.getMonth()
    const nowDay = now.getDate()
    
    const slotYear = slotDate.getFullYear()
    const slotMonth = slotDate.getMonth()
    const slotDay = slotDate.getDate()
    
    // Check if it's the same day
    const isSameDay = nowYear === slotYear && nowMonth === slotMonth && nowDay === slotDay
    
    if (!isSameDay) {
      return false
    }
    
    // Check if current time falls within this 15-minute slot
    const currentHour = now.getHours()
    const currentMinutes = now.getMinutes()
    const currentQuarter = Math.floor(currentMinutes / 15)
    
    const isCurrentSlot = currentHour === hour && currentQuarter === quarter
    
    
    return isCurrentSlot
  }

  return (
    <div className={cn("space-y-3", className)}>
      {/* Header with time labels */}
      <div className="flex items-center space-x-2">
        <div className="w-20 flex-shrink-0" /> {/* Space for day names */}
        <div className="w-12 flex-shrink-0" /> {/* Space for dates */}
        <div className="flex justify-between text-xs text-gray-500 flex-1">
          <span>12AM</span>
          <span>4AM</span>
          <span>8AM</span>
          <span>12PM</span>
          <span>4PM</span>
          <span>8PM</span>
          <span>11:59PM</span>
        </div>
        <div className="w-12 text-xs text-gray-500 font-medium text-right flex-shrink-0">
          Hours
        </div>
      </div>

      {/* Timeline rows for each workday */}
      <div className="relative" style={{gap: '2px', display: 'flex', flexDirection: 'column'}}>
        {workdays.map((workday) => {
          // Calculate total active time for this day
          const totalActiveMinutes = workday.timeline.reduce((sum, slot) => sum + slot.activeMinutes, 0)
          const totalActiveHours = Math.floor(totalActiveMinutes / 60)
          const remainingMinutes = totalActiveMinutes % 60
          const timeDisplay = totalActiveHours > 0 
            ? `${totalActiveHours}h ${remainingMinutes}m` 
            : `${remainingMinutes}m`
          
          // Format date as "Mon 7/12" - parse as local date to avoid timezone issues
          const dateParts = workday.date.split('-')
          const month = parseInt(dateParts[1])
          const day = parseInt(dateParts[2])
          
          return (
            <div key={workday.date} className="flex items-center space-x-2 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors duration-150 rounded px-1 group">
              {/* Day name */}
              <div className="w-20 flex-shrink-0 text-xs text-gray-700 dark:text-gray-300 group-hover:text-gray-900 dark:group-hover:text-gray-100 font-medium text-right pr-2 transition-colors duration-150">
                {workday.dayShort}
              </div>
              
              {/* Date */}
              <div className="w-12 flex-shrink-0 text-xs text-gray-500 group-hover:text-gray-700 dark:group-hover:text-gray-300 font-mono text-center transition-colors duration-150">
                {month}/{day}
              </div>
              
              {/* Timeline blocks - 15-minute granularity (5AM-9PM, 9PM-12AM) */}
              <div className="flex items-center flex-1 relative">
                {workday.timeline
                  // Show full 24 hours
                  .map((slot) => {
                  
                  
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
                        handleSlotHover(slot, workday, rect.left + rect.width / 2, rect.top - 40)
                      }}
                      onMouseLeave={handleSlotHoverLeave}
                    />
                  )
                })}
                
              </div>
              
              {/* Daily total time */}
              <div className="w-12 text-xs text-gray-600 group-hover:text-gray-800 dark:group-hover:text-gray-200 font-medium text-right flex-shrink-0 transition-colors duration-150">
                {timeDisplay}
              </div>
            </div>
          )
        })}
        
        {/* Current time indicator - only shows on the first day (today/selected date) */}
        {(() => {
          // Only show the red line on the first workday (today/selected date)
          if (workdays.length === 0) return null
          
          const firstWorkday = workdays[0] // First day is the selected date
          const now = currentTime
          
          // Check if the first workday is today (current date)
          const dateParts = firstWorkday.date.split('-')
          const year = parseInt(dateParts[0])
          const month = parseInt(dateParts[1])
          const day = parseInt(dateParts[2])
          const workdayDate = new Date(year, month - 1, day)
          
          const isFirstDayToday = now.getFullYear() === workdayDate.getFullYear() &&
                                 now.getMonth() === workdayDate.getMonth() &&
                                 now.getDate() === workdayDate.getDate()
          
          // Only show current time indicator if the first day is today
          if (!isFirstDayToday) return null
          
          // Calculate current position using the same logic as TodayOverview
          const currentHour = now.getHours()
          const currentMinute = now.getMinutes()
          
          // Timeline shows full 24 hours (0-23)
          const visibleStartHour = 0
          const totalVisibleHours = 24 // Full day
          
          // Calculate current position within visible hours
          const hoursFromStart = currentHour - visibleStartHour
          const minutesFromStart = hoursFromStart * 60 + currentMinute
          const totalVisibleMinutes = totalVisibleHours * 60 // 24 hours * 60 minutes
          
          // Calculate percentage position within the visible timeline
          const currentTimePosition = (minutesFromStart / totalVisibleMinutes) * 100
          
          return (
            <div
              className="absolute w-px bg-red-400 z-10 pointer-events-none"
              style={{
                left: `calc(9rem + (100% - 12.5rem) * ${currentTimePosition / 100})`,
                top: '0',
                height: '1rem', // Match timeline block height (h-4)
                maxHeight: '1rem', // Ensure it doesn't exceed block height
              }}
            >
              {/* Top indicator only */}
              <div className="absolute -top-2 left-1/2 transform -translate-x-1/2 w-2 h-2 bg-red-400 rounded-full" />
            </div>
          )
        })()}
      </div>
      

      {/* Custom tooltip rendered via portal to avoid layout shifts */}
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
            const isCurrentTime = isCurrentTimeSlot(hoveredSlot.workday.date, hoveredSlot.slot.hour, hoveredSlot.slot.quarter)
            
            return `${hoveredSlot.workday.dayShort} ${startTime} - ${endTime}${hoveredSlot.slot.hasMessages ? ` • ${hoveredSlot.slot.messageCount} messages` : ''}${isCurrentTime ? ' • CURRENT TIME' : ''}`
          })()}
        </div>,
        document.body
      )}
    </div>
  )
}

export default memo(UserTimeline)