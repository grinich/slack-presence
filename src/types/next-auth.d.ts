import { DefaultSession, DefaultUser } from "next-auth"
import { DefaultJWT } from "next-auth/jwt"

declare module "next-auth" {
  interface Session {
    user: {
      slackUserId?: string
      slackTeamId?: string
    } & DefaultSession["user"]
  }

  interface User extends DefaultUser {
    slackUserId: string
    slackTeamId: string
    slackAccessToken: string
    slackBotToken?: string
    slackTeamName?: string
    timezone?: string
  }
}

declare module "next-auth/jwt" {
  interface JWT extends DefaultJWT {
    slackUserId?: string
    slackTeamId?: string
    slackAccessToken?: string
  }
}