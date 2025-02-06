import { Link } from 'wasp/client/router'
import { motion } from 'motion/react'
import { fadeIn } from '../../motion/transitionPresets'
import {
  DiscordLogo,
  Plus,
  User as UserIcon,
  Heart,
  XLogo,
  HandHeart,
} from '@phosphor-icons/react'
import { usePrefetch } from '../../lib/utils'
import { Button } from '../../client/components/ui/button'
import { type User } from 'wasp/entities'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '../../client/components/ui/dropdown-menu'
import { logout } from 'wasp/client/auth'
import { useState } from 'react'

interface FooterProps {
  user?: User | null
  userLoading: boolean
}

const ScrollToTopLink = ({
  to,
  children,
  className,
}: {
  to: '/'
  children: React.ReactNode
  className?: string
}) => {
  const handleClick = () => {
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }
  const prefetch = usePrefetch()

  return (
    <Link
      to={to}
      className={className}
      onClick={handleClick}
      onMouseEnter={() => prefetch(to, undefined, { assets: true })}
    >
      {children}
    </Link>
  )
}

export function Footer({ user, userLoading }: FooterProps) {
  const [dropdownOpen, setDropdownOpen] = useState(false)

  return (
    <motion.footer
      variants={fadeIn}
      initial='initial'
      animate='animate'
      className='relative z-50 w-full bg-background'
    >
      <div className='mx-auto w-full max-w-7xl px-4 py-6'>
        {/* Community Support Banner */}
        <div className='mb-8 flex flex-col items-center justify-between gap-4 rounded-lg border-2 border-primary/20 bg-primary/5 px-6 py-4 text-center sm:flex-row sm:text-left'>
          <div className='space-y-1.5'>
            <h3 className='flex items-center justify-center gap-2 text-lg font-semibold tracking-tight sm:justify-start'>
              <Heart
                size={24}
                weight='fill'
                className='animate-pulse text-primary'
              />
              Keep scoutahead.pro free forever
            </h3>
            <p className='font-sans text-sm leading-relaxed text-muted-foreground'>
              Hosting costs are funded by the community. Your support helps keep
              scoutahead.pro free for everyone.
            </p>
          </div>
          <Button variant='default' size='sm' asChild className='font-medium'>
            <a
              href='https://www.buymeacoffee.com/wardbox'
              target='_blank'
              rel='noopener noreferrer'
              className='whitespace-nowrap font-sans'
            >
              <HandHeart size={16} weight='fill' className='mr-2' />
              Support
            </a>
          </Button>
        </div>

        {/* Bottom Bar */}
        <div className='flex items-center justify-between gap-4'>
          <div className='flex items-center gap-4'>
            <Button
              size='default'
              variant='default'
              className='font-medium tracking-tight'
            >
              <ScrollToTopLink
                to='/'
                className='flex items-center gap-2 font-sans'
              >
                <Plus size={16} />
                Start New Draft
              </ScrollToTopLink>
            </Button>
          </div>
          <div className='flex items-center gap-4 text-center'>
            <p className='text-balance font-sans text-sm text-muted-foreground'>
              Using scoutahead in your tournament or have some feedback? Let us
              know in our discord, we&apos;d love to hear from you!
            </p>
          </div>
          <div className='flex items-center gap-4'>
            <a
              href='https://discord.gg/aPcNhT2mt6'
              target='_blank'
              rel='noopener noreferrer'
              className='inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground'
            >
              <DiscordLogo size={24} />
            </a>
            <a
              href='https://twitter.com/ward_box'
              target='_blank'
              rel='noopener noreferrer'
              className='inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground'
            >
              <XLogo size={24} />
            </a>
            <div className='flex items-center gap-2'>
              {userLoading && (
                <Button
                  variant='outline'
                  size='icon'
                  className='font-medium'
                  disabled
                >
                  <UserIcon size={16} weight='fill' />
                </Button>
              )}

              {!userLoading && user && (
                <DropdownMenu
                  open={dropdownOpen}
                  onOpenChange={setDropdownOpen}
                  modal={false}
                >
                  <DropdownMenuTrigger asChild>
                    <Button size='icon' className='font-medium'>
                      <UserIcon size={16} weight='fill' />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align='end' className='w-56 bg-muted'>
                    <Link
                      to='/profile/:id'
                      params={{ id: user.id }}
                      onClick={() => setDropdownOpen(false)}
                    >
                      <DropdownMenuItem className='cursor-pointer'>
                        Profile
                      </DropdownMenuItem>
                    </Link>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem
                      className='cursor-pointer text-red-600'
                      onClick={() => {
                        setDropdownOpen(false)
                        logout()
                      }}
                    >
                      Log out
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              )}

              {!userLoading && !user && (
                <Button size='sm' className='font-sans font-medium' asChild>
                  <Link to='/login'>Log In</Link>
                </Button>
              )}
            </div>
          </div>
        </div>
      </div>
    </motion.footer>
  )
}

export default Footer
