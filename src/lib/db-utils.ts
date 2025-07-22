import { prisma } from './db'

// Utility to check database connection health
export async function checkDatabaseHealth() {
  try {
    const start = Date.now()
    await prisma.$queryRaw`SELECT 1 as health`
    const duration = Date.now() - start
    
    console.log(`✅ Database connection healthy (${duration}ms)`)
    return { healthy: true, duration }
  } catch (error) {
    console.error('❌ Database connection failed:', error)
    return { healthy: false, error: error instanceof Error ? error.message : String(error) }
  }
}

// Utility to gracefully close database connections
export async function closeDatabaseConnections() {
  try {
    await prisma.$disconnect()
    console.log('✅ Database connections closed')
  } catch (error) {
    console.error('❌ Error closing database connections:', error)
  }
}

// Utility to get database connection pool stats (if available)
export async function getDatabaseStats() {
  try {
    // Note: Prisma doesn't expose connection pool stats directly
    // This would need to be implemented at the database level
    const userCount = await prisma.user.count()
    const presenceLogCount = await prisma.presenceLog.count()
    
    return {
      userCount,
      presenceLogCount,
      timestamp: new Date().toISOString()
    }
  } catch (error) {
    console.error('❌ Error getting database stats:', error)
    return null
  }
}

// Batch operations utility
export class BatchProcessor<T> {
  private batchSize: number
  private items: T[] = []
  
  constructor(batchSize: number = 100) {
    this.batchSize = batchSize
  }
  
  add(item: T) {
    this.items.push(item)
  }
  
  async process<R>(processor: (batch: T[]) => Promise<R[]>): Promise<R[]> {
    const results: R[] = []
    
    for (let i = 0; i < this.items.length; i += this.batchSize) {
      const batch = this.items.slice(i, i + this.batchSize)
      const batchResults = await processor(batch)
      results.push(...batchResults)
      
      // Small delay to prevent overwhelming the database
      if (i + this.batchSize < this.items.length) {
        await new Promise(resolve => setTimeout(resolve, 10))
      }
    }
    
    return results
  }
  
  clear() {
    this.items = []
  }
  
  get length() {
    return this.items.length
  }
}

// Database query timeout wrapper
export async function withTimeout<T>(
  promise: Promise<T>, 
  timeoutMs: number = 30000,
  operation: string = 'Database operation'
): Promise<T> {
  const timeout = new Promise<never>((_, reject) => {
    setTimeout(() => reject(new Error(`${operation} timed out after ${timeoutMs}ms`)), timeoutMs)
  })
  
  return Promise.race([promise, timeout])
}