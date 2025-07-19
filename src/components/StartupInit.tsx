'use client'

import { useEffect } from 'react'

export default function StartupInit() {
  useEffect(() => {
    // Trigger startup initialization on client mount
    const triggerStartup = async () => {
      try {
        const response = await fetch('/api/startup-init')
        if (!response.ok) {
          console.warn('Startup init failed:', response.status)
        }
      } catch (error) {
        console.warn('Startup init error:', error)
      }
    }

    // Only trigger on first mount, with a small delay to ensure server is ready
    const timer = setTimeout(triggerStartup, 1000)
    return () => clearTimeout(timer)
  }, [])

  return null // This component doesn't render anything
}