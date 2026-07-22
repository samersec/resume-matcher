import { useEffect, useMemo, useState } from 'react'
import './App.css'

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://127.0.0.1:8000'
const LEMON_SQUEEZY_CHECKOUT_URL = import.meta.env.VITE_LEMONSQUEEZY_CHECKOUT_URL || ''
const LEMON_SQUEEZY_PORTAL_URL = import.meta.env.VITE_LEMONSQUEEZY_PORTAL_URL || ''

const friendlyMessages = {
  analyze: 'We could not finish the analysis right now. Please try again in a moment.',
  subscription: 'We could not check your subscription right now. Please try again shortly.',
  checkout: 'We could not open the checkout right now. Please try again shortly.',
  portal: 'Subscription management is not available right now. Please try again later.',
  email: 'Please add your email to continue.',
}

const sampleResume = `Product designer and front-end engineer with 5+ years of experience building customer-facing web apps. Strong in React, accessibility, design systems, API integration, and rapid prototyping. Led launch of a self-serve dashboard that increased activation by 18%.

Experience highlights:
- Built responsive SaaS interfaces with React and TypeScript
- Collaborated with product and engineering to ship weekly releases
- Improved conversion through UX testing and iteration`

const sampleJob = `We are hiring a front-end engineer to build polished SaaS experiences. Required skills include React, JavaScript, CSS, accessibility, analytics, REST APIs, and strong communication. Nice to have: TypeScript, design systems, A/B testing, and product thinking.`

function App() {
  const [resume, setResume] = useState('')
  const [jobDescription, setJobDescription] = useState('')
  const [email, setEmail] = useState('')
  const [result, setResult] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [subscriptionLoading, setSubscriptionLoading] = useState(false)
  const [subscriptionMessage, setSubscriptionMessage] = useState('')
  const [subscriptionError, setSubscriptionError] = useState('')
  const [subscriptionInfo, setSubscriptionInfo] = useState(null)
  const [checkoutNotice, setCheckoutNotice] = useState('')

  const resumeWords = useMemo(() => resume.trim().split(/\s+/).filter(Boolean).length, [resume])
  const jobWords = useMemo(() => jobDescription.trim().split(/\s+/).filter(Boolean).length, [jobDescription])

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    if (params.get('checkout') === 'success') {
      setCheckoutNotice('Payment complete. Check your email address below and click Refresh premium status.')
    }
  }, [])

  const refreshSubscriptionStatus = async () => {
    if (!email.trim()) {
      setSubscriptionError(friendlyMessages.email)
      return
    }

    setSubscriptionError('')
    setSubscriptionMessage('')
    setSubscriptionLoading(true)

    try {
      const response = await fetch(`${API_BASE_URL}/subscription/status?email=${encodeURIComponent(email.trim())}`)
      const data = await response.json().catch(() => null)

      if (!response.ok) {
        console.error('Subscription status request failed', data)
        throw new Error(friendlyMessages.subscription)
      }

      setSubscriptionInfo(data)
      setSubscriptionMessage(
        data.is_premium
          ? `Premium active${data.subscription_status ? ` (${data.subscription_status})` : ''}`
          : 'No active premium subscription found yet.'
      )
    } catch (err) {
      setSubscriptionError(err instanceof Error ? err.message : friendlyMessages.subscription)
    } finally {
      setSubscriptionLoading(false)
    }
  }

  const openCheckout = () => {
    if (!LEMON_SQUEEZY_CHECKOUT_URL) {
      setSubscriptionError(friendlyMessages.checkout)
      return
    }

    setSubscriptionError('')
    setSubscriptionMessage('')
    window.location.href = LEMON_SQUEEZY_CHECKOUT_URL
  }

  const openCustomerPortal = () => {
    if (!LEMON_SQUEEZY_PORTAL_URL) {
      setSubscriptionError(friendlyMessages.portal)
      return
    }

    setSubscriptionError('')
    setSubscriptionMessage('')
    window.location.href = LEMON_SQUEEZY_PORTAL_URL
  }

  const fillSample = () => {
    setResume(sampleResume)
    setJobDescription(sampleJob)
    setError('')
  }

  const handleAnalyze = async () => {
    if (!resume.trim() || !jobDescription.trim()) {
      setError('Please add both your resume and the job description first.')
      return
    }

    setError('')
    setLoading(true)
    setResult(null)

    try {
      const response = await fetch(`${API_BASE_URL}/analyze`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ resume, job_description: jobDescription, email: email || null }),
      })

      const data = await response.json().catch(() => null)

      if (!response.ok) {
        console.error('Analyze request failed', data)
        throw new Error(friendlyMessages.analyze)
      }

      setResult(data)
      setSubscriptionInfo(data)
      if (data.is_premium) {
        setSubscriptionMessage('Premium access detected for this email.')
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : friendlyMessages.analyze)
    } finally {
      setLoading(false)
    }
  }

  const score = result?.score ?? 0
  const scoreLabel =
    score >= 80 ? 'Strong match' : score >= 60 ? 'Promising match' : score >= 40 ? 'Needs work' : 'Weak match'

  return (
    <main className="shell">
      <section className="hero">
        <div className="hero-copy">
          <span className="eyebrow">ATS score checker</span>
          <h1>See how your resume stacks up before you hit apply.</h1>
          <p className="lede">
            Paste your resume and a job description. Get a match score, missing keyword gaps, and practical rewrite
            tips in seconds. Add your email to unlock premium checks.
          </p>

          <div className="hero-metrics">
            <div>
              <strong>1 prompt</strong>
              <span>one LLM call</span>
            </div>
            <div>
              <strong>3 checks</strong>
              <span>free per day per IP</span>
            </div>
            <div>
              <strong>0 files</strong>
              <span>paste-only v1</span>
            </div>
          </div>
        </div>

        <aside className="hero-panel">
          <div className="panel-badge">Free tier</div>
          <h2>Weekend-to-launch scope</h2>
          <ul>
            <li>Frontend: one page, two inputs, one action, one result card</li>
            <li>Premium checkout: enter email, buy access, unlock unlimited checks</li>
          </ul>
          <button className="ghost-button" onClick={fillSample} type="button">
            Load demo content
          </button>
        </aside>
      </section>

      <section className="subscription-card">
        <div className="subscription-copy">
          <span className="section-label">Subscription</span>
          <h2>Upgrade to premium and remove the daily limit.</h2>
          <p>
            Free users can run 3 checks per day from the same IP address. Premium users get unlimited checks when they
            use the same email they subscribed with.
          </p>
          <div className="subscription-status-row">
            <span className={subscriptionInfo?.is_premium ? 'status-pill premium' : 'status-pill free'}>
              {subscriptionInfo?.is_premium ? 'Premium active' : 'Free plan'}
            </span>
            {subscriptionInfo?.subscription_status && (
              <span className="muted">Status: {subscriptionInfo.subscription_status}</span>
            )}
          </div>
        </div>

        <div className="subscription-form">
          <label className="field">
            <span>Email address</span>
            <input
              className="text-input"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
            />
          </label>

          <div className="subscription-actions">
            <button className="primary-button" onClick={openCheckout} type="button">
              Upgrade with Lemon Squeezy
            </button>
            <button className="ghost-button" onClick={refreshSubscriptionStatus} disabled={subscriptionLoading} type="button">
              {subscriptionLoading ? 'Checking...' : 'Refresh premium status'}
            </button>
            <button className="ghost-button" onClick={openCustomerPortal} disabled={!LEMON_SQUEEZY_PORTAL_URL} type="button">
              Manage subscription
            </button>
          </div>

          {checkoutNotice && <div className="alert success">{checkoutNotice}</div>}
          {subscriptionMessage && <div className="alert info">{subscriptionMessage}</div>}
          {subscriptionError && <div className="alert error">{subscriptionError}</div>}
          <p className="hint">Use the same email for checkout and analysis so premium access is detected.</p>
        </div>
      </section>

      <section className="workspace">
        <div className="editor-grid">
          <label className="input-card">
            <div className="input-head">
              <span>Resume</span>
              <small>{resumeWords} words</small>
            </div>
            <textarea
              rows="16"
              value={resume}
              onChange={(e) => setResume(e.target.value)}
              placeholder="Paste your resume text here..."
            />
          </label>

          <label className="input-card">
            <div className="input-head">
              <span>Job description</span>
              <small>{jobWords} words</small>
            </div>
            <textarea
              rows="16"
              value={jobDescription}
              onChange={(e) => setJobDescription(e.target.value)}
              placeholder="Paste the job description here..."
            />
          </label>
        </div>

        <div className="email-callout">
          <div>
            <strong>Tip</strong>
            <p className="muted">Use the same email for checkout and analyzing so premium access is detected.</p>
          </div>
          <div className={subscriptionInfo?.is_premium ? 'status-pill premium' : 'status-pill free'}>
            {subscriptionInfo?.is_premium ? 'Unlimited checks enabled' : 'Free checks only'}
          </div>
        </div>

        <div className="actions-row">
          <button className="primary-button" onClick={handleAnalyze} disabled={loading} type="button">
            {loading ? 'Analyzing match...' : 'Analyze match'}
          </button>
          <p className="hint">Your analysis stays in this app and returns a simple match summary.</p>
        </div>

        {error && <div className="alert error">{error}</div>}

        {result && (
          <section className="result-card">
            <div className="result-top">
              <div>
                <span className="section-label">Result</span>
                <h2>{scoreLabel}</h2>
                <p>
                  Your resume matches the role at <strong>{score}/100</strong>. Free checks left today:{' '}
                  <strong>{result.is_premium ? 'Unlimited' : result.remaining_today}</strong>.
                </p>
              </div>

              <div className="score-ring" style={{ '--score': `${score}%` }}>
                <span>{score}</span>
                <small>/100</small>
              </div>
            </div>

            <div className="result-columns">
              <div>
                <h3>Missing keywords</h3>
                {result.missing_keywords?.length ? (
                  <ul className="chips-list">
                    {result.missing_keywords.map((keyword, index) => (
                      <li key={`${keyword}-${index}`}>{keyword}</li>
                    ))}
                  </ul>
                ) : (
                  <p className="muted">No obvious keyword gaps were returned.</p>
                )}
              </div>

              <div>
                <h3>Quick tips</h3>
                {result.tips?.length ? (
                  <ol className="tips-list">
                    {result.tips.map((tip, index) => (
                      <li key={`${tip}-${index}`}>{tip}</li>
                    ))}
                  </ol>
                ) : (
                  <p className="muted">No tips were returned.</p>
                )}
              </div>
            </div>
          </section>
        )}
      </section>
    </main>
  )
}

export default App