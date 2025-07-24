import { NextResponse } from 'next/server'

export async function GET() {
  try {
    console.log('🧪 Manual presence collection trigger...')
    
    // Get the cron secret
    const cronSecret = process.env.CRON_SECRET
    if (!cronSecret) {
      return NextResponse.json({ 
        error: 'CRON_SECRET not available' 
      }, { status: 500 })
    }
    
    // Get the base URL
    const baseUrl = process.env.NEXTAUTH_URL || 'https://slack-presence.vercel.app'
    
    // Trigger the presence collection manually
    const response = await fetch(`${baseUrl}/api/cron/collect-presence`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${cronSecret}`,
        'User-Agent': 'Debug-Manual-Trigger'
      }
    })
    
    const responseText = await response.text()
    let responseData
    try {
      responseData = JSON.parse(responseText)
    } catch {
      responseData = { rawResponse: responseText }
    }
    
    return NextResponse.json({
      trigger: 'manual',
      timestamp: new Date().toISOString(),
      response: {
        status: response.status,
        statusText: response.statusText,
        ok: response.ok,
        data: responseData
      }
    })
    
  } catch (error) {
    console.error('❌ Error in manual trigger:', error)
    const errorMessage = error instanceof Error ? error.message : String(error)
    return NextResponse.json({ 
      error: 'Manual trigger failed',
      details: errorMessage 
    }, { status: 500 })
  }
}