'use client'

import { memo } from 'react'
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

interface WeeklyOverviewProps {
  days: DayData[]
  className?: string
}

function WeeklyOverview({ days, className }: WeeklyOverviewProps) {
  const formatMinutes = (minutes: number) => {
    const hours = Math.floor(minutes / 60)
    const mins = minutes % 60
    return hours > 0 ? `${hours}h ${mins}m` : `${mins}m`
  }

  const getActivityLevel = (minutes: number) => {
    if (minutes === 0) return 'none'
    if (minutes < 120) return 'low'      // < 2 hours
    if (minutes < 240) return 'medium'   // < 4 hours
    if (minutes < 480) return 'high'     // < 8 hours
    return 'very-high'                   // 8+ hours
  }

  const getActivityColor = (level: string) => {
    switch (level) {
      case 'none': return 'bg-muted'
      case 'low': return 'bg-success/30'
      case 'medium': return 'bg-success/60'
      case 'high': return 'bg-success/80'
      case 'very-high': return 'bg-success'
      default: return 'bg-muted'
    }
  }

  // Group days into weeks
  const weeks: DayData[][] = []
  let currentWeek: DayData[] = []
  
  days.forEach((day, index) => {
    currentWeek.push(day)
    
    // Start a new week every 7 days or on the last day
    if (currentWeek.length === 7 || index === days.length - 1) {
      weeks.push([...currentWeek])
      currentWeek = []
    }
  })

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr)
    return date.toLocaleDateString('en-US', { 
      month: 'short', 
      day: 'numeric' 
    })
  }

  const getDayOfWeek = (dateStr: string) => {
    const date = new Date(dateStr)
    return date.toLocaleDateString('en-US', { weekday: 'short' })
  }

  if (days.length === 0) {
    return (
      <div className={cn("text-center py-8 text-muted-foreground", className)}>
        <p>No activity data available</p>
      </div>
    )
  }

  return (
    <div className={cn("space-y-6", className)}>
      {/* Legend */}
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-medium text-foreground">Activity Heatmap</h3>
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <span>Less</span>
          <div className="flex gap-1">
            <div className="w-3 h-3 rounded-sm bg-muted" />
            <div className="w-3 h-3 rounded-sm bg-success/30" />
            <div className="w-3 h-3 rounded-sm bg-success/60" />
            <div className="w-3 h-3 rounded-sm bg-success/80" />
            <div className="w-3 h-3 rounded-sm bg-success" />
          </div>
          <span>More</span>
        </div>
      </div>

      {/* Weekly grid */}
      <div className="space-y-4">
        {weeks.map((week, weekIndex) => (
          <div key={weekIndex} className="space-y-2">
            <div className="text-xs text-muted-foreground font-medium">
              Week of {formatDate(week[0].date)}
            </div>
            
            <div className="grid grid-cols-7 gap-2">
              {week.map((day) => {
                const activityLevel = getActivityLevel(day.totalActiveMinutes)
                return (
                  <div
                    key={day.date}
                    className="group relative"
                  >
                    <div
                      className={cn(
                        "aspect-square rounded-lg border border-border/50 transition-all hover:border-border hover:scale-105 cursor-pointer",
                        getActivityColor(activityLevel)
                      )}
                    >
                      <div className="p-2 h-full flex flex-col justify-between">
                        <div className="text-xs font-medium text-foreground/80">
                          {getDayOfWeek(day.date)}
                        </div>
                        <div className="text-right">
                          <div className="text-xs text-muted-foreground">
                            {new Date(day.date).getDate()}
                          </div>
                          <div className="text-xs font-medium text-foreground mt-1">
                            {formatMinutes(day.totalActiveMinutes)}
                          </div>
                        </div>
                      </div>
                    </div>
                    
                    {/* Tooltip */}
                    <div className="absolute bottom-full left-1/2 transform -translate-x-1/2 mb-2 px-2 py-1 bg-card border border-border text-card-foreground text-xs rounded shadow-lg opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none whitespace-nowrap z-10">
                      {formatDate(day.date)}: {formatMinutes(day.totalActiveMinutes)}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        ))}
      </div>

      {/* Summary stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 pt-4 border-t border-border">
        <div className="text-center">
          <div className="text-lg font-semibold text-foreground">
            {days.filter(day => day.totalActiveMinutes > 0).length}
          </div>
          <div className="text-xs text-muted-foreground">Active Days</div>
        </div>
        
        <div className="text-center">
          <div className="text-lg font-semibold text-foreground">
            {formatMinutes(Math.max(...days.map(day => day.totalActiveMinutes)))}
          </div>
          <div className="text-xs text-muted-foreground">Peak Day</div>
        </div>
        
        <div className="text-center">
          <div className="text-lg font-semibold text-foreground">
            {formatMinutes(Math.round(days.reduce((sum, day) => sum + day.totalActiveMinutes, 0) / days.length))}
          </div>
          <div className="text-xs text-muted-foreground">Daily Avg</div>
        </div>
        
        <div className="text-center">
          <div className="text-lg font-semibold text-foreground">
            {Math.round((days.filter(day => day.totalActiveMinutes > 0).length / days.length) * 100)}%
          </div>
          <div className="text-xs text-muted-foreground">Consistency</div>
        </div>
      </div>
    </div>
  )
}

export default memo(WeeklyOverview)