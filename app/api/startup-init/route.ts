import { NextResponse } from 'next/server'

export async function GET() {
  try {
    console.log('Server startup - triggering initial data collection...')
    
    // Trigger company-wide user sync and presence collection
    const cronSecret = process.env.CRON_SECRET
    if (cronSecret) {
      const baseUrl = process.env.NEXTAUTH_URL || 'http://localhost:3000'
      
      // Run startup tasks in parallel for faster initialization
      const tasks = [
        // Sync all company users (includes timezone data)
        fetch(`${baseUrl}/api/cron/sync-all-users`, {
          method: 'GET',
          headers: {
            'Authorization': `Bearer ${cronSecret}`
          }
        }).then(async (response) => {
          if (response.ok) {
            const result = await response.json()
            console.log('Startup company sync triggered successfully:', result)
            return { task: 'sync-users', success: true, result }
          } else {
            console.error('Failed to trigger startup company sync:', response.status)
            return { task: 'sync-users', success: false, error: response.status }
          }
        }).catch(error => {
          console.error('Error triggering startup company sync:', error)
          return { task: 'sync-users', success: false, error: error.message }
        }),

        // Collect current presence data
        fetch(`${baseUrl}/api/cron/collect-presence`, {
          method: 'GET',
          headers: {
            'Authorization': `Bearer ${cronSecret}`
          }
        }).then(async (response) => {
          if (response.ok) {
            const result = await response.json()
            console.log('Startup presence collection triggered successfully:', result)
            return { task: 'collect-presence', success: true, result }
          } else {
            console.error('Failed to trigger startup presence collection:', response.status)
            return { task: 'collect-presence', success: false, error: response.status }
          }
        }).catch(error => {
          console.error('Error triggering startup presence collection:', error)
          return { task: 'collect-presence', success: false, error: error.message }
        })
      ]

      // Wait for all tasks to complete
      const results = await Promise.all(tasks)
      
      return NextResponse.json({
        message: 'Server startup initialization completed',
        results,
        timestamp: new Date().toISOString()
      })
    }
    
    return NextResponse.json({ 
      message: 'Server startup initialization triggered (no CRON_SECRET)',
      timestamp: new Date().toISOString()
    })
  } catch (error) {
    console.error('Startup initialization error:', error)
    const errorMessage = error instanceof Error ? error.message : String(error)
    return NextResponse.json({ 
      error: 'Startup initialization failed',
      details: errorMessage 
    }, { status: 500 })
  }
}