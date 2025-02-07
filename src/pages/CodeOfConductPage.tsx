import { Link } from 'wasp/client/router'
import { ArrowLeft } from '@phosphor-icons/react'

export function CodeOfConductPage() {
  return (
    <div className='min-h-screen bg-background p-8'>
      <div className='mx-auto max-w-2xl'>
        <Link
          to='/'
          className='mb-8 inline-flex items-center gap-2 text-sm text-muted-foreground transition-colors hover:text-foreground'
        >
          <ArrowLeft className='h-4 w-4' />
          Back to home
        </Link>

        <div className='prose prose-gray dark:prose-invert max-w-none'>
          <h1 className='mb-8 text-4xl font-bold tracking-tight'>
            Code of Conduct
          </h1>

          <div className='rounded-lg border border-border bg-card p-6'>
            <p className='lead m-0 text-lg text-muted-foreground'>
              We built scoutahead.pro to be a place where everyone can practice
              drafting without worrying about harassment or discrimination.
              That&apos;s why we have a zero-tolerance policy for discriminatory
              behavior.
            </p>
          </div>

          <div className='mt-12 space-y-12'>
            <section>
              <h2 className='text-2xl font-semibold tracking-tight'>
                Keep It Clean
              </h2>
              <p className='mt-4 text-muted-foreground'>
                We don&apos;t allow any discriminatory language, including:
              </p>
              <ul className='mt-2 space-y-2 text-muted-foreground'>
                <li>Racial or ethnic slurs</li>
                <li>Homophobic language</li>
                <li>Transphobic language</li>
                <li>Ableist slurs</li>
                <li>Any other forms of hate speech</li>
              </ul>
            </section>

            <section>
              <h2 className='text-2xl font-semibold tracking-tight'>
                How We Handle It
              </h2>
              <p className='mt-4 text-muted-foreground'>
                Our system automatically blocks discriminatory content. If you
                try to bypass these protections, we may need to suspend your
                account or restrict access to the platform. We&apos;d rather not
                do that, so please keep it respectful.
              </p>
            </section>

            <section>
              <h2 className='text-2xl font-semibold tracking-tight'>
                See Something?
              </h2>
              <p className='mt-4 text-muted-foreground'>
                If you spot any discriminatory content that made it through our
                filters, let us know right away. We&apos;ll look into it and
                take care of it promptly.
              </p>
            </section>
          </div>
        </div>
      </div>
    </div>
  )
}
