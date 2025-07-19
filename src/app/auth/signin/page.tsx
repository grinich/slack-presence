'use client'

import { signIn, getSession } from 'next-auth/react'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'

export default function SignIn() {
  const [isLoading, setIsLoading] = useState(false)
  const router = useRouter()

  useEffect(() => {
    // Check if user is already signed in
    getSession().then((session) => {
      if (session) {
        router.push('/')
      }
    })
  }, [router])

  const handleSlackSignIn = async () => {
    setIsLoading(true)
    try {
      await signIn('slack', { callbackUrl: '/' })
    } catch (error) {
      console.error('Sign in error:', error)
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <CardTitle className="text-2xl">Slack Team Analytics</CardTitle>
          <CardDescription>
            Connect your Slack workspace to view team presence and activity analytics
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Button 
            onClick={handleSlackSignIn}
            disabled={isLoading}
            className="w-full bg-[#4A154B] hover:bg-[#350d36] text-white"
            size="lg"
          >
            {isLoading ? (
              <div className="flex items-center space-x-2">
                <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                <span>Connecting...</span>
              </div>
            ) : (
              <div className="flex items-center space-x-2">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M5.042 15.165a2.528 2.528 0 0 1-2.52-2.523c0-1.395 1.129-2.528 2.52-2.528h2.52v2.528c0 1.394-1.125 2.523-2.52 2.523m0-6.33H2.522c-1.391 0-2.522-1.133-2.522-2.527S1.131 3.78 2.522 3.78h2.52c1.395 0 2.52 1.133 2.52 2.528s-1.125 2.527-2.52 2.527"/>
                  <path d="M8.958 15.165c-1.395 0-2.522-1.129-2.522-2.523V2.522c0-1.391 1.127-2.522 2.522-2.522s2.522 1.131 2.522 2.522v10.12c0 1.394-1.127 2.523-2.522 2.523"/>
                  <path d="M8.958 18.835a2.528 2.528 0 0 1 2.522 2.523c0 1.395-1.127 2.528-2.522 2.528H6.436v-2.528c0-1.394 1.127-2.523 2.522-2.523m6.33 0h2.52c1.395 0 2.522 1.129 2.522 2.523s-1.127 2.528-2.522 2.528h-2.52c-1.391 0-2.522-1.133-2.522-2.528s1.131-2.523 2.522-2.523"/>
                  <path d="M15.288 8.835c1.395 0 2.522 1.129 2.522 2.523v10.12c0 1.395-1.127 2.522-2.522 2.522s-2.522-1.127-2.522-2.522V11.358c0-1.394 1.131-2.523 2.522-2.523"/>
                  <path d="M15.288 5.165a2.528 2.528 0 0 1-2.522-2.523c0-1.395 1.131-2.528 2.522-2.528h2.52v2.528c0 1.394-1.125 2.523-2.52 2.523m0 6.33h2.52c1.395 0 2.522 1.133 2.522 2.527s-1.127 2.528-2.522 2.528h-2.52c-1.391 0-2.522-1.134-2.522-2.528s1.131-2.527 2.522-2.527"/>
                </svg>
                <span>Connect with Slack</span>
              </div>
            )}
          </Button>
          
          <div className="text-center text-sm text-gray-600">
            <p>This app will access:</p>
            <ul className="mt-2 text-xs space-y-1">
              <li>• Your profile information</li>
              <li>• Channel and message history</li>
              <li>• Team member list</li>
              <li>• Workspace information</li>
            </ul>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}