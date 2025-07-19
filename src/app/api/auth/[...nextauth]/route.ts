import NextAuth from 'next-auth'
import { prisma } from '@/lib/db'

const handler = NextAuth({
  providers: [
    {
      id: 'slack',
      name: 'Slack',
      type: 'oauth',
      version: '2.0',
      authorization: {
        url: 'https://slack.com/oauth/v2/authorize',
        params: {
          scope: [
            'users:read',
            'users:read.email', 
            'channels:read',
            'channels:history',
            'groups:read',
            'groups:history',
            'im:read',
            'im:history',
            'mpim:read',
            'mpim:history',
            'team:read',
            'users.profile:read'
          ].join(' '),
          user_scope: [
            'channels:read',
            'channels:history',
            'groups:read',
            'groups:history',
            'im:read',
            'im:history',
            'mpim:read',
            'mpim:history',
            'users:read',
            'team:read'
          ].join(' ')
        }
      },
      token: 'https://slack.com/api/oauth.v2.access',
      userinfo: {
        url: 'https://slack.com/api/auth.test',
        async request({ tokens }: { tokens: { authed_user?: { access_token?: string }; access_token?: string } }) {
          // Use the user token (authed_user.access_token) instead of bot token
          const userToken = tokens.authed_user?.access_token || tokens.access_token
          
          // First, get the user info to get the team
          const authResponse = await fetch('https://slack.com/api/auth.test', {
            headers: {
              'Authorization': `Bearer ${userToken}`,
            },
          })
          const authData = await authResponse.json()
          
          if (!authData.ok) {
            throw new Error(`Slack API error: ${authData.error}`)
          }
          
          // Get user info using the user token
          const userResponse = await fetch('https://slack.com/api/users.info', {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${userToken}`,
              'Content-Type': 'application/x-www-form-urlencoded',
            },
            body: new URLSearchParams({
              user: authData.user_id
            })
          })
          const userData = await userResponse.json()
          
          if (!userData.ok) {
            throw new Error(`Slack API error: ${userData.error}`)
          }
          
          return {
            id: authData.user_id,
            name: userData.user.real_name,
            email: userData.user.profile?.email,
            image: userData.user.profile?.image_192,
            team: authData.team,
            team_id: authData.team_id,
            user_id: authData.user_id,
            user_token: userToken,
            bot_token: tokens.access_token
          }
        }
      },
      clientId: process.env.SLACK_CLIENT_ID,
      clientSecret: process.env.SLACK_CLIENT_SECRET,
      profile(profile) {
        return {
          id: profile.user.id,
          name: profile.user.real_name || profile.user.name,
          email: profile.user.profile?.email || '',
          image: profile.user.profile?.image_192 || '',
          slackUserId: profile.user.id,
          slackTeamId: profile.team_id,
          slackAccessToken: profile.user_token, // Use user token instead of bot token
          slackBotToken: profile.bot_token, // Store bot token separately
          slackTeamName: profile.team,
          timezone: profile.user.tz
        }
      }
    }
  ],
  callbacks: {
    async signIn({ user, account }) {
      if (account?.provider === 'slack') {
        try {
          // Check if user exists, if not create them
          const existingUser = await prisma.user.findUnique({
            where: { slackUserId: user.slackUserId }
          })

          if (!existingUser) {
            await prisma.user.create({
              data: {
                slackUserId: user.slackUserId,
                name: user.name || 'Unknown',
                email: user.email || '',
                avatarUrl: user.image || '',
                slackAccessToken: user.slackAccessToken,
                slackTeamId: user.slackTeamId,
                timezone: user.timezone,
                metadata: JSON.stringify({
                  teamName: user.slackTeamName,
                  connectedAt: new Date().toISOString(),
                  botToken: user.slackBotToken
                })
              }
            })
          } else {
            // Update existing user with fresh token
            await prisma.user.update({
              where: { slackUserId: user.slackUserId },
              data: {
                slackAccessToken: user.slackAccessToken,
                name: user.name || existingUser.name,
                email: user.email || existingUser.email,
                avatarUrl: user.image || existingUser.avatarUrl,
                timezone: user.timezone || existingUser.timezone,
                metadata: JSON.stringify({
                  ...(existingUser.metadata ? JSON.parse(existingUser.metadata) : {}),
                  lastConnected: new Date().toISOString(),
                  botToken: user.slackBotToken
                })
              }
            })
          }
          return true
        } catch (error) {
          console.error('Error storing user:', error)
          return false
        }
      }
      return true
    },
    async session({ session, token }) {
      if (token.slackUserId) {
        session.user.slackUserId = token.slackUserId
        session.user.slackTeamId = token.slackTeamId
      }
      return session
    },
    async jwt({ token, user, account }) {
      if (account?.provider === 'slack') {
        token.slackUserId = user.slackUserId
        token.slackTeamId = user.slackTeamId
        token.slackAccessToken = user.slackAccessToken
      }
      return token
    }
  },
  pages: {
    signIn: '/auth/signin',
    error: '/auth/error'
  }
})

export { handler as GET, handler as POST }