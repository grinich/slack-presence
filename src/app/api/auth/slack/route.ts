import { NextRequest, NextResponse } from 'next/server'
import { InstallProvider } from '@slack/oauth'
import { WebClient } from '@slack/web-api'

const installer = new InstallProvider({
  clientId: process.env.SLACK_CLIENT_ID!,
  clientSecret: process.env.SLACK_CLIENT_SECRET!,
  stateSecret: process.env.SLACK_SIGNING_SECRET!,
  installationStore: {
    storeInstallation: async (installation) => {
      // Store installation in database
      console.log('Store installation:', installation)
      return Promise.resolve()
    },
    fetchInstallation: async (installQuery) => {
      // Fetch installation from database
      console.log('Fetch installation:', installQuery)
      // For now, throw error to indicate no installation found
      throw new Error('Installation not found')
    },
    deleteInstallation: async (installQuery) => {
      // Delete installation from database
      console.log('Delete installation:', installQuery)
      return Promise.resolve()
    },
  },
})

export async function GET(request: NextRequest) {
  const url = await installer.generateInstallUrl({
    scopes: ['users:read', 'users:read.email', 'channels:read', 'groups:read', 'im:read', 'mpim:read'],
    userScopes: [],
  })
  
  return NextResponse.redirect(url)
}

export async function POST(request: NextRequest) {
  const url = new URL(request.url)
  const code = url.searchParams.get('code')
  const state = url.searchParams.get('state')
  
  if (!code) {
    return NextResponse.json({ error: 'Missing code' }, { status: 400 })
  }
  
  try {
    // Exchange code for tokens using Web API
    const client = new WebClient()
    const result = await client.oauth.v2.access({
      client_id: process.env.SLACK_CLIENT_ID!,
      client_secret: process.env.SLACK_CLIENT_SECRET!,
      code: code,
    })
    
    if (!result.ok) {
      throw new Error('OAuth access failed')
    }
    
    return NextResponse.json({ success: true, result })
  } catch (error) {
    console.error('OAuth callback error:', error)
    return NextResponse.json({ error: 'OAuth failed' }, { status: 500 })
  }
}