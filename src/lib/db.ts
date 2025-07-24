import { PrismaClient } from '@prisma/client'

// Use DATABASE_URL from environment variables
function getDatabaseUrl(): string {
  const databaseUrl = process.env.DATABASE_URL
  
  if (!databaseUrl) {
    console.error('❌ DATABASE_URL environment variable is missing')
    throw new Error('DATABASE_URL environment variable is required')
  }
  
  // Log connection info (without exposing full URL for security)
  const urlObj = new URL(databaseUrl)
  console.log('🔌 Database connection config:', {
    host: urlObj.hostname,
    port: urlObj.port || '5432',
    database: urlObj.pathname.slice(1),
    ssl: urlObj.searchParams.get('sslmode') || 'prefer',
    hasPassword: !!urlObj.password,
    hasUsername: !!urlObj.username
  })
  
  return databaseUrl
}

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined
}

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    datasources: {
      db: {
        url: getDatabaseUrl()
      }
    },
    log: process.env.NODE_ENV === 'development' ? ['info', 'warn', 'error'] : ['error']
  })

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma