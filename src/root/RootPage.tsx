import { Outlet } from 'react-router-dom'
import { useAuth } from 'wasp/client/auth'
import { MotionConfig } from 'motion/react'
import { MotionProvider } from '../motion/motion-provider'
import { ThemeProvider } from './components/theme-provider'
import { Footer } from './components/footer'
import { Nav } from './components/nav'
import { ScrollToTop } from './components/scroll-to-top'
import { Toaster } from './components/toaster'
import { transitions } from '../motion/transitionPresets'
import './Root.css'
// Supports weights 100-900
import '@fontsource-variable/inter';

export default function Root() {
  const { data: user, isLoading } = useAuth()

  return (
    <MotionConfig reducedMotion='user' transition={transitions.snappy}>
      <ThemeProvider defaultTheme='dark' storageKey='vite-ui-theme'>
        <MotionProvider>
          <div className='flex min-h-screen flex-col'>
            <header className='border-b'>
              <Nav user={user} userLoading={isLoading} />
            </header>
            <main className='flex-1'>
              <Outlet />
            </main>
            <Toaster />
            <ScrollToTop />
            <footer className='border-t border-input bg-background'>
              <div className='mx-auto max-w-7xl'>
                <Footer />
              </div>
            </footer>
          </div>
        </MotionProvider>
      </ThemeProvider>
    </MotionConfig>
  )
}
