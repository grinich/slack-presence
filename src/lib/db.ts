import { PrismaClient } from '@prisma/client'

// Construct the correct DATABASE_URL if not provided or if it's using the pooled connection
function getDatabaseUrl(): string {
  let databaseUrl = process.env.DATABASE_URL || process.env.POSTGRES_URL
  
  // If we're using the problematic pooled connection, replace it with direct connection
  if (databaseUrl?.includes('aws-0-us-west-1.pooler.supabase.com:6543')) {
    // Use direct connection instead of pooled connection
    databaseUrl = databaseUrl.replace(
      'aws-0-us-west-1.pooler.supabase.com:6543',
      'db.bjrlawhflwfjljdufyvt.supabase.co:5432'
    )
  }
  
  // If no DATABASE_URL is set, try to construct one from components
  if (!databaseUrl) {
    const host = 'db.bjrlawhflwfjljdufyvt.supabase.co'
    const port = '5432'
    const database = 'postgres'
    const user = 'postgres.bjrlawhflwfjljdufyvt'
    const password = process.env.SUPABASE_DB_PASSWORD || 'postgres'
    
    databaseUrl = `postgresql://${user}:${password}@${host}:${port}/${database}?schema=public&sslmode=require`
  }
  
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
    }
  })

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma