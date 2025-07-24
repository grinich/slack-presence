'use client'

import { useEffect, useState } from 'react'

export default function StartupInit() {
  const [initStatus, setInitStatus] = useState<string>('')
  
  useEffect(() => {
    async function initialize() {
      try {
        // Start initialization in background without blocking UI
        console.log('Starting background initialization...')
        setInitStatus('Loading app...')
        
        // Quick presence collection only (skip heavy user sync)
        setInitStatus('Loading recent activity...')
        
        // Call the collect-presence endpoint directly (without cron header check)  
        const presenceResponse = await fetch('/api/init/collect-presence', {
          method: 'POST'
        })
        
        if (!presenceResponse.ok) {
          const presenceErrorData = await presenceResponse.json()
          console.error('Presence collection failed:', presenceResponse.status, presenceErrorData)
          // Don't show error to user, app can function without this
        } else {
          const presenceResult = await presenceResponse.json()
          console.log('Presence collection completed:', presenceResult)
        }
        
        // Run user sync in background without blocking UI
        setTimeout(async () => {
          try {
            console.log('Starting background user sync...')
            const syncResponse = await fetch('/api/init/sync-users', {
              method: 'POST'
            })
            
            if (syncResponse.ok) {
              const syncResult = await syncResponse.json()
              console.log('Background user sync completed:', syncResult)
            } else {
              console.warn('Background user sync failed - using existing data')
            }
          } catch (error) {
            console.warn('Background user sync error:', error)
          }
        }, 1000) // Delay by 1 second to not block initial load
        
        setInitStatus('App ready')
        
        // Hide the status quickly since app is ready
        setTimeout(() => setInitStatus(''), 1500)
        
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