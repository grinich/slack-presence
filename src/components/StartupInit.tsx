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
          console.error('User sync failed:', syncResponse.status)
          setInitStatus('User sync failed')
          return
        }
        
        const syncResult = await syncResponse.json()
        console.log('User sync completed:', syncResult)
        
        setInitStatus('Collecting initial presence data...')
        
        // Call the collect-presence endpoint directly (without cron header check)  
        const presenceResponse = await fetch('/api/init/collect-presence', {
          method: 'POST'
        })
        
        if (!presenceResponse.ok) {
          console.error('Presence collection failed:', presenceResponse.status)
          setInitStatus('Presence collection failed')
          return
        }
        
        const presenceResult = await presenceResponse.json()
        console.log('Presence collection completed:', presenceResult)
        
        setInitStatus('Initialization completed')
        
      } catch (error) {
        console.error('Initialization error:', error)
        setInitStatus('Initialization error')
      }
    }
    
    initialize()
  }, [])

  return (
    <div className="fixed bottom-4 right-4 bg-blue-100 text-blue-800 text-xs px-3 py-1 rounded shadow z-50">
      {initStatus}
    </div>
  )
}