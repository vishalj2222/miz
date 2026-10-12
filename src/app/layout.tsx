import type { Metadata, Viewport } from 'next'
import { Bricolage_Grotesque, Inter_Tight, IBM_Plex_Mono } from 'next/font/google'
import { Providers } from '@/components/providers'
import { SwRegister } from '@/components/sw-register'
import { EdgeSwipeBack } from '@/components/edge-swipe-back'
import { startupImages } from '@/lib/splash'
import './globals.css'

const display = Bricolage_Grotesque({ subsets: ['latin'], variable: '--font-display' })
const body = Inter_Tight({ subsets: ['latin'], variable: '--font-body' })
const mono = IBM_Plex_Mono({ subsets: ['latin'], weight: ['400', '500'], variable: '--font-mono' })

export const metadata: Metadata = {
  title: 'Mise',
  description: 'A personal cooking log',
  icons: { apple: [{ url: '/apple-touch-icon.png' }] },
  appleWebApp: { capable: true, statusBarStyle: 'default', title: 'Mise', startupImage: startupImages },
}

export const viewport: Viewport = {
  themeColor: '#EDEEEA',
  viewportFit: 'cover',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className={`${display.variable} ${body.variable} ${mono.variable} font-body antialiased`}>
        <Providers>
          {children}
          <SwRegister />
          <EdgeSwipeBack />
        </Providers>
      </body>
    </html>
  )
}
