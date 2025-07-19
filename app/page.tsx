import { Metadata } from 'next'
import AuthenticatedDashboard from '../src/components/AuthenticatedDashboard'

export const metadata: Metadata = {
  title: 'Online',
  description: 'See who\'s online and active right now'
}

export default function HomePage() {
  return <AuthenticatedDashboard />
}