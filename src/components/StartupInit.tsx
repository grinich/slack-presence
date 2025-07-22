'use client'

import { useEffect, useState } from 'react'

export default function StartupInit() {
  const [initStatus, setInitStatus] = useState<string>('Starting initialization...')
  
  useEffect(() => {
    async function initialize() {
      try {
        console.log('Starting user sync initialization...')
        setInitStatus('Syncing users from Slack...')
        
        // Call the sync-all-users endpoint directly (without cron header check)
        const syncResponse = await fetch('/api/init/sync-users', {
          method: 'POST'
        })
        
        if (!syncResponse.ok) {
          const errorData = await syncResponse.json()
          
          // Handle rate limiting gracefully
          if (syncResponse.status === 429 && errorData.graceful) {
            console.warn('User sync rate limited - continuing with existing data')
            setInitStatus('Rate limited - using cached data...')
            // Don't return, continue to presence collection
          } else {
            console.error('User sync failed:', syncResponse.status, errorData)
            setInitStatus('User sync failed - using cached data')
            return
          }
        } else {
          const syncResult = await syncResponse.json()
          console.log('User sync completed:', syncResult)
        }
        
        setInitStatus('Collecting initial presence data...')
        
        // Call the collect-presence endpoint directly (without cron header check)  
        const presenceResponse = await fetch('/api/init/collect-presence', {
          method: 'POST'
        })
        
        if (!presenceResponse.ok) {
          const presenceErrorData = await presenceResponse.json()
          console.error('Presence collection failed:', presenceResponse.status, presenceErrorData)
          setInitStatus('Presence collection failed - app ready')
          // Still show as completed since the app can function without initial presence data
          setTimeout(() => setInitStatus('App ready (limited data)'), 1000)
          return
        }
        
        const presenceResult = await presenceResponse.json()
        console.log('Presence collection completed:', presenceResult)
        
        setInitStatus('Initialization completed')
        
        // Hide the status after a few seconds
        setTimeout(() => setInitStatus(''), 3000)
        
      } catch (error) {
        console.error('Initialization error:', error)
        setInitStatus('Network error - app ready with cached data')
        // Still allow the app to function
        setTimeout(() => setInitStatus(''), 3000)
      }
    }
    
    initialize()
  }, [])

  // Don't render anything if status is empty
  if (!initStatus) return null

  return (
    <div className="fixed bottom-4 right-4 bg-blue-100 text-blue-800 text-xs px-3 py-1 rounded shadow z-50">
      {initStatus}
    </div>
  )
}