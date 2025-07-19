import { NextResponse } from 'next/server'
import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

export async function GET() {
  try {
    // Simple test query
    await prisma.$queryRaw`SELECT 1 as test`
    return NextResponse.json({ success: true, message: 'Database connection successful' })
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error)
    return NextResponse.json({ success: false, error: errorMessage }, { status: 500 })
  }
}