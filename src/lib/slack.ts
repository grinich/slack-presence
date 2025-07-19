import { WebClient } from '@slack/web-api'

export interface SlackUser {
  id: string
  name: string
  real_name: string
  profile: {
    email?: string
    image_512?: string
  }
  tz?: string
}

export interface SlackPresence {
  presence: 'active' | 'away'
  online: boolean
  auto_away: boolean
  manual_away: boolean
  connection_count: number
  last_activity: number
}

export async function getTeamUsers(userAccessToken: string): Promise<SlackUser[]> {
  try {
    const client = new WebClient(userAccessToken)
    const result = await client.users.list({})
    
    return (result.members as SlackUser[]) || []
  } catch (error) {
    console.error('Error fetching team users:', error)
    return []
  }
}

export async function getUserPresence(userId: string, userAccessToken: string): Promise<SlackPresence | null> {
  try {
    const client = new WebClient(userAccessToken)
    
    const result = await client.users.getPresence({
      user: userId,
    })
    
    return result as SlackPresence
  } catch (error) {
    console.error(`Error fetching presence for user ${userId}:`, error)
    return null
  }
}