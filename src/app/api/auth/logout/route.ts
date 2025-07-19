import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { cookies } from 'next/headers'

export async function POST(request: NextRequest) {
  try {
    // Clear all NextAuth cookies
    const cookieStore = cookies()
    
    // Get all cookies that might be NextAuth related
    const allCookies = cookieStore.getAll()
    
    // Create response with redirects
    const response = NextResponse.redirect(new URL('/auth/signin', request.url))
    
    // Clear NextAuth cookies
    const cookiesToClear = [
      'next-auth.session-token',
      'next-auth.csrf-token',
      'next-auth.callback-url',
      'next-auth.pkce.code_verifier',
      '__Secure-next-auth.session-token',
      '__Host-next-auth.csrf-token',
      '__Secure-next-auth.callback-url',
      '__Host-next-auth.pkce.code_verifier'
    ]
    
    // Clear standard cookies
    cookiesToClear.forEach(name => {
      response.cookies.delete(name)
      response.cookies.set(name, '', {
        expires: new Date(0),
        path: '/',
        httpOnly: true,
        secure: true,
        sameSite: 'lax'
      })
    })
    
    // Also clear any other NextAuth cookies we might have missed
    allCookies.forEach(cookie => {
      if (cookie.name.includes('next-auth')) {
        response.cookies.delete(cookie.name)
        response.cookies.set(cookie.name, '', {
          expires: new Date(0),
          path: '/',
          httpOnly: true,
          secure: true,
          sameSite: 'lax'
        })
      }
    })
    
    return response
  } catch (error) {
    console.error('Error during logout:', error)
    return NextResponse.redirect(new URL('/auth/signin', request.url))
  }
}

export async function GET(request: NextRequest) {
  return POST(request)
}