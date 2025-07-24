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
    log: [
      {
        emit: 'event',
        level: 'query',
      },
      {
        emit: 'event',
        level: 'error',
      },
      {
        emit: 'event',
        level: 'info',
      },
      {
        emit: 'event',
        level: 'warn',
      },
    ],
  })

// Set up event listeners for better debugging
prisma.$on('query', (e) => {
  if (process.env.NODE_ENV === 'development') {
    console.log('🗃️ Query:', e.query)
    console.log('🗃️ Params:', e.params)
    console.log('🗃️ Duration:', e.duration + 'ms')
  }
})

prisma.$on('error', (e) => {
  console.error('❌ Database Error:', e)
})

prisma.$on('warn', (e) => {
  console.warn('⚠️ Database Warning:', e)
})

prisma.$on('info', (e) => {
  console.log('ℹ️ Database Info:', e)
})

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma