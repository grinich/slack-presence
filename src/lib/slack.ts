import { WebClient } from '@slack/web-api'

export const slackClient = new WebClient(process.env.SLACK_BOT_TOKEN)

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

export async function getTeamUsers(): Promise<SlackUser[]> {
  try {
    const result = await slackClient.users.list({
      exclude_archived: true,
      exclude_bot_users: true,
    })
    
    return (result.members as SlackUser[]) || []
  } catch (error) {
    console.error('Error fetching team users:', error)
    return []
  }
}

export async function getUserPresence(userId: string, userAccessToken?: string): Promise<SlackPresence | null> {
  try {
    // Use user's access token if provided, otherwise use bot token
    const client = userAccessToken ? new WebClient(userAccessToken) : slackClient
    
    const result = await client.users.getPresence({
      user: userId,
    })
    
    return result as SlackPresence
  } catch (error) {
    console.error(`Error fetching presence for user ${userId}:`, error)
    return null
  }
}