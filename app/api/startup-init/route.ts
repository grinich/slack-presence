import { NextResponse } from 'next/server'

export async function GET() {
  // Simple endpoint that just confirms the server is running
  // Cron jobs handle all data initialization automatically
  return NextResponse.json({ 
    message: 'Server startup acknowledged - cron jobs handle initialization',
    timestamp: new Date().toISOString(),
    status: 'ready'
  })
}