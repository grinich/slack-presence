import { NextRequest, NextResponse } from 'next/server'
import { checkDatabaseHealth, getDatabaseStats } from '@/lib/db-utils'
import { prisma } from '@/lib/db'

export async function GET(request: NextRequest) {
  try {
    // Simple auth check - only allow in development or with admin secret
    const isDev = process.env.NODE_ENV === 'development'
    const adminSecret = request.headers.get('x-admin-secret')
    const validSecret = process.env.ADMIN_SECRET || process.env.CRON_SECRET
    
    if (!isDev && (!adminSecret || !validSecret || adminSecret !== validSecret)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    
    console.log('🔍 Checking database health...')
    
    // Check basic database connectivity
    const healthCheck = await checkDatabaseHealth()
    
    // Get basic database stats
    const stats = await getDatabaseStats()
    
    // Check if we can perform basic operations
    const operationalChecks = {
      canReadUsers: false,
      canReadPresenceLogs: false,
      connectionPoolConfig: {
        max: parseInt(process.env.DB_POOL_MAX || '15'),
        min: parseInt(process.env.DB_POOL_MIN || '2'),
        timeout: parseInt(process.env.DB_POOL_TIMEOUT || '30000')
      }
    }
    
    try {
      await prisma.user.findFirst({ select: { id: true } })
      operationalChecks.canReadUsers = true
    } catch (error) {
      console.error('❌ Cannot read users table:', error)
    }
    
    try {
      await prisma.presenceLog.findFirst({ select: { id: true } })
      operationalChecks.canReadPresenceLogs = true
    } catch (error) {
      console.error('❌ Cannot read presence_logs table:', error)
    }
    
    const response = {
      timestamp: new Date().toISOString(),
      health: healthCheck,
      stats,
      operational: operationalChecks,
      environment: {
        nodeEnv: process.env.NODE_ENV,
        hasDatabaseUrl: !!process.env.DATABASE_URL,
        hasDirectUrl: !!process.env.DIRECT_URL,
        connectionPoolConfig: operationalChecks.connectionPoolConfig
      }
    }
    
    console.log('✅ Database health check completed')
    
    return NextResponse.json(response)
    
  } catch (error) {
    console.error('❌ Database health check failed:', error)
    
    return NextResponse.json({
      error: 'Database health check failed',
      details: error instanceof Error ? error.message : String(error),
      timestamp: new Date().toISOString()
    }, { status: 500 })
  }
}