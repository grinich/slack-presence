'use client'

import { useState, useCallback, useRef, memo } from 'react'
import { createPortal } from 'react-dom'
import { cn } from '@/lib/utils'

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

interface DayData {
  date: string
  dayName: string
  dayShort: string
  totalActiveMinutes: number
  timeline: TimelineBlock[]
}

interface DailyTimelineProps {
  days: DayData[]
  className?: string
}

function DailyTimeline({ days, className }: DailyTimelineProps) {
  const [hoveredSlot, setHoveredSlot] = useState<{
    slot: TimelineBlock
    day: DayData
    x: number
    y: number
  } | null>(null)
  
  const hoverTimeoutRef = useRef<NodeJS.Timeout | null>(null)

  // Debounced hover handlers
  const handleSlotHover = useCallback((slot: TimelineBlock, day: DayData, x: number, y: number) => {
    if (hoverTimeoutRef.current) {
      clearTimeout(hoverTimeoutRef.current)
    }
    hoverTimeoutRef.current = setTimeout(() => {
      setHoveredSlot({ slot, day, x, y })
    }, 100)
  }, [])

  const handleSlotHoverLeave = useCallback(() => {
    if (hoverTimeoutRef.current) {
      clearTimeout(hoverTimeoutRef.current)
    }
    setHoveredSlot(null)
  }, [])

  const getStatusColor = useCallback((status: string) => {
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

  const formatTime = useCallback((hour: number, quarter: number) => {
    const ampm = hour >= 12 ? 'PM' : 'AM'
    const displayHour = hour === 0 ? 12 : hour > 12 ? hour - 12 : hour
    const minutes = quarter * 15
    return `${displayHour}:${minutes.toString().padStart(2, '0')}${ampm}`
  }, [])

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr)
    return date.toLocaleDateString('en-US', { 
      month: 'short', 
      day: 'numeric',
      weekday: 'short'
    })
  }

  const formatMinutes = (minutes: number) => {
    const hours = Math.floor(minutes / 60)
    const mins = minutes % 60
    return hours > 0 ? `${hours}h ${mins}m` : `${mins}m`
  }

  if (days.length === 0) {
    return (
      <div className={cn("text-center py-12 text-muted-foreground", className)}>
        <p>No activity data available</p>
      </div>
    )
  }

  return (
    <div className={cn("space-y-4", className)}>
      {/* Header with time labels */}
      <div className="flex items-center space-x-3 pb-2">
        <div className="w-24 flex-shrink-0" /> {/* Space for day names */}
        <div className="w-16 flex-shrink-0" /> {/* Space for dates */}
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

      {/* Timeline rows for each day */}
      <div className="space-y-2">
        {days.map((day) => (
          <div key={day.date} className="flex items-center space-x-3 hover:bg-accent/30 transition-colors duration-150 rounded-lg px-2 py-2 group">
            {/* Day name */}
            <div className="w-24 flex-shrink-0 text-sm text-foreground group-hover:text-foreground font-medium text-right pr-2 transition-colors duration-150">
              {day.dayShort}
            </div>
            
            {/* Date */}
            <div className="w-16 flex-shrink-0 text-xs text-muted-foreground group-hover:text-foreground font-mono text-center transition-colors duration-150">
              {new Date(day.date).getDate()}/{new Date(day.date).getMonth() + 1}
            </div>
            
            {/* Timeline blocks */}
            <div className="flex items-center flex-1 relative">
              {day.timeline.map((slot) => (
                <div
                  key={slot.blockIndex}
                  className={cn(
                    "h-6 cursor-pointer transition-all hover:scale-110 flex-1 min-w-0 rounded-sm",
                    getStatusColor(slot.status),
                    "opacity-100"
                  )}
                  onMouseEnter={(e) => {
                    const rect = e.currentTarget.getBoundingClientRect()
                    handleSlotHover(slot, day, rect.left + rect.width / 2, rect.top - 40)
                  }}
                  onMouseLeave={handleSlotHoverLeave}
                />
              ))}
            </div>
            
            {/* Daily total time */}
            <div className="w-16 text-sm text-muted-foreground group-hover:text-foreground font-medium text-right flex-shrink-0 transition-colors duration-150">
              {formatMinutes(day.totalActiveMinutes)}
            </div>
          </div>
        ))}
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
            
            return `${formatDate(hoveredSlot.day.date)} ${startTime} - ${endTime} • ${hoveredSlot.slot.activeMinutes}min active`
          })()}
        </div>,
        document.body
      )}
    </div>
  )
}

export default memo(DailyTimeline)