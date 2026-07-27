import { useEffect, useMemo, useState } from 'react'
import './App.css'
import { Analytics } from '@vercel/analytics/react'

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

  // Landing page state
  const [openFaq, setOpenFaq] = useState(0)
  const [activeModal, setActiveModal] = useState(null) // 'privacy' | 'terms' | 'contact' | null
  const [contactForm, setContactForm] = useState({ name: '', email: '', message: '', submitted: false })

  const resumeWords = useMemo(() => resume.trim().split(/\s+/).filter(Boolean).length, [resume])
  const jobWords = useMemo(() => jobDescription.trim().split(/\s+/).filter(Boolean).length, [jobDescription])
  const overallScore = result?.overall_match_score ?? result?.score ?? 0
  const categoryScores = Array.isArray(result?.category_scores) ? result.category_scores : []
  const matchingSkills = Array.isArray(result?.matching_skills) ? result.matching_skills : []
  const missingSkills = Array.isArray(result?.missing_skills)
    ? result.missing_skills
    : Array.isArray(result?.missing_keywords)
      ? result.missing_keywords
      : []
  const criticalMissingRequirements = Array.isArray(result?.critical_missing_requirements)
    ? result.critical_missing_requirements
    : []
  const quickTips = Array.isArray(result?.quick_tips) ? result.quick_tips : Array.isArray(result?.tips) ? result.tips : []
  const improvementSuggestions = Array.isArray(result?.cv_improvement_suggestions)
    ? result.cv_improvement_suggestions
    : []
  const scoreExplanation = result?.score_explanation || ''
  const warningMessage =
    result?.warning ||
    'A missing keyword does not automatically mean the skill is absent. It may simply not be written in the CV.'
  const bestMatchingSkill = matchingSkills[0] || 'No clear top match returned'
  const primaryGap = missingSkills[0] || criticalMissingRequirements[0] || 'No clear gap returned'
  const evaluatedCategoryCount = categoryScores.length
  const evaluatedCoverageLabel = evaluatedCategoryCount
    ? `${evaluatedCategoryCount} category${evaluatedCategoryCount === 1 ? '' : 'ies'} evaluated`
    : 'No category breakdown available'

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
    scrollToSection('workspace')
  }

  const scrollToSection = (id) => {
    const el = document.getElementById(id)
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'start' })
    }
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

  const scoreLabel =
    overallScore >= 80 ? 'Strong match' : overallScore >= 60 ? 'Promising match' : overallScore >= 40 ? 'Needs work' : 'Weak match'

  const faqItems = [
    {
      q: 'How does Resume Matcher work?',
      a: 'Our AI compares the exact wording, technical skills, domain requirements, and key terms in your CV against your target job description. It calculates an overall match score, identifies missing keywords, and gives actionable tips to boost your application alignment.',
    },
    {
      q: 'Is Resume Matcher really free to try?',
      a: 'Yes! Free users get 3 full checks per day without entering a credit card or signing up for an account. It is designed for students, recent graduates, and active job seekers who want quick, reliable feedback.',
    },
    {
      q: 'Will using Resume Matcher guarantee I get hired?',
      a: 'No system can guarantee employment because hiring decisions depend on recruiter preferences, interview performance, and candidate pool competition. However, aligning your CV with job requirements significantly increases your chances of passing automated ATS screeners and landing recruiter interviews.',
    },
    {
      q: 'How does the $10/month Premium plan work?',
      a: 'Upgrading to Premium gives you unlimited daily CV checks, priority processing speed, detailed category scores, and subscription self-management. Enter your purchase email to unlock unlimited access across all your devices.',
    },
    {
      q: 'Is my CV data secure and private?',
      a: 'Yes. Your resume and job descriptions are analyzed strictly transiently to generate your match report. We do not sell your personal information or store your resume content permanently.',
    },
  ]

  return (
    <div className="landing-app">
      {/* Navigation Header */}
      <header className="navbar">
        <div className="nav-container">
          <a href="#" className="nav-brand">
            <span className="brand-logo">⚡</span>
            <span className="brand-name">Resume Matcher</span>
            <span className="brand-tag">SaaS</span>
          </a>

          <nav className="nav-links">
            <button onClick={() => scrollToSection('problem')} type="button" className="nav-link">
              Problem
            </button>
            <button onClick={() => scrollToSection('how-it-works')} type="button" className="nav-link">
              How It Works
            </button>
            <button onClick={() => scrollToSection('example-result')} type="button" className="nav-link">
              Example Result
            </button>
            <button onClick={() => scrollToSection('benefits')} type="button" className="nav-link">
              Benefits
            </button>
            <button onClick={() => scrollToSection('pricing')} type="button" className="nav-link">
              Pricing
            </button>
            <button onClick={() => scrollToSection('faq')} type="button" className="nav-link">
              FAQ
            </button>
          </nav>

          <div className="nav-actions">
            <button className="primary-button nav-cta" onClick={() => scrollToSection('workspace')} type="button">
              Check My CV
            </button>
          </div>
        </div>
      </header>

      {/* Main Shell */}
      <main className="shell">
        {/* Hero Section */}
        <section className="hero-landing">
          <div className="hero-badge-wrap">
            <span className="eyebrow">Targeted for Students • Graduates • Job Seekers • Internships</span>
          </div>

          <h1 className="hero-headline">
            Know If Your CV Matches The Job <span className="highlight-text">Before You Apply</span>
          </h1>

          <p className="hero-subheadline">
            Stop sending blind applications into ATS black holes. Paste your CV and a job description to get an instant AI match
            analysis, discover missing keywords, and get actionable tips to optimize your application in seconds.
          </p>

          <div className="hero-cta-group">
            <button className="primary-button hero-cta" onClick={() => scrollToSection('workspace')} type="button">
              Check My CV Now
            </button>
            <button className="ghost-button hero-sample-cta" onClick={fillSample} type="button">
              Try Demo Example
            </button>
          </div>

          <div className="hero-trust-bar">
            <span>✓ 3 Free checks per day</span>
            <span>✓ No credit card required</span>
            <span>✓ Instant AI keyword analysis</span>
          </div>

          <div className="hero-metrics-grid">
            <div className="metric-card">
              <strong>75%+</strong>
              <span>Resumes filtered out by ATS before human review</span>
            </div>
            <div className="metric-card">
              <strong>10 Seconds</strong>
              <span>Average time to analyze complete keyword gaps</span>
            </div>
            <div className="metric-card">
              <strong>$0 Free</strong>
              <span>Start checking your CV today with zero risk</span>
            </div>
          </div>
        </section>

        {/* Problem Section */}
        <section id="problem" className="landing-section">
          <div className="section-header">
            <span className="section-label">The Problem</span>
            <h2>Why applying for jobs feels like a black hole</h2>
            <p>Most job seekers make the mistake of sending the same generic resume to every job listing.</p>
          </div>

          <div className="problem-grid">
            <article className="problem-card">
              <div className="problem-icon">🚫</div>
              <h3>The ATS Black Hole</h3>
              <p>Applicant Tracking Systems scan for exact phrases before a human ever reads your CV. Missing key terms means instant automated rejection.</p>
            </article>

            <article className="problem-card">
              <div className="problem-icon">🔍</div>
              <h3>Hidden Keyword Gaps</h3>
              <p>Job descriptions are filled with specific skills, tools, and technical buzzwords that are difficult to spot manually when skimming listings.</p>
            </article>

            <article className="problem-card">
              <div className="problem-icon">📄</div>
              <h3>Generic One-Size-Fits-All CVs</h3>
              <p>Submitting an uncustomized resume for distinct job roles leads to low match relevance and drastically reduces interview callback rates.</p>
            </article>

            <article className="problem-card">
              <div className="problem-icon">❓</div>
              <h3>Zero Helpful Feedback</h3>
              <p>Rejection emails never tell you *why* you were passed over, leaving candidates confused about what skills to improve or highlight.</p>
            </article>
          </div>
        </section>

        {/* How It Works Section */}
        <section id="how-it-works" className="landing-section">
          <div className="section-header">
            <span className="section-label">How It Works</span>
            <h2>Three simple steps to a tailored application</h2>
            <p>Analyze and optimize your resume in under a minute.</p>
          </div>

          <div className="steps-grid">
            <div className="step-card">
              <div className="step-number">01</div>
              <h3>Paste Your CV</h3>
              <p>Copy and paste your resume text into our simple analyzer box. No complex formatting required.</p>
            </div>

            <div className="step-card">
              <div className="step-number">02</div>
              <h3>Paste Job Description</h3>
              <p>Paste the job posting you want to target, including responsibilities and technical requirements.</p>
            </div>

            <div className="step-card">
              <div className="step-number">03</div>
              <h3>Get AI Match Analysis</h3>
              <p>Instantly receive your match score, missing skills list, category breakdowns, and concrete tips.</p>
            </div>
          </div>
        </section>

        {/* Workspace / Interactive Tool */}
        <section id="workspace" className="landing-section workspace-wrapper">
          <div className="section-header">
            <span className="section-label">Interactive AI Analyzer</span>
            <h2>Check your CV match score right now</h2>
            <p>Paste your details below or click 'Load sample data' to test the AI engine instantly.</p>
          </div>

          <div className="workspace">
            <div className="workspace-top-bar">
              <button className="ghost-button fill-sample-btn" onClick={fillSample} type="button">
                ✨ Load sample data
              </button>
              <div className="tier-indicator">
                <span className={subscriptionInfo?.is_premium ? 'status-pill premium' : 'status-pill free'}>
                  {subscriptionInfo?.is_premium ? 'Premium Unlimited' : 'Free tier (3/day)'}
                </span>
              </div>
            </div>

            <div className="editor-grid">
              <label className="input-card">
                <div className="input-head">
                  <span>Resume / CV Text</span>
                  <small>{resumeWords} words</small>
                </div>
                <textarea
                  rows="14"
                  value={resume}
                  onChange={(e) => setResume(e.target.value)}
                  placeholder="Paste your resume or CV text here..."
                />
              </label>

              <label className="input-card">
                <div className="input-head">
                  <span>Target Job Description</span>
                  <small>{jobWords} words</small>
                </div>
                <textarea
                  rows="14"
                  value={jobDescription}
                  onChange={(e) => setJobDescription(e.target.value)}
                  placeholder="Paste the job description here..."
                />
              </label>
            </div>

            <div className="email-callout">
              <div className="email-input-group">
                <label htmlFor="analyzer-email" className="muted-label">
                  Email (optional for free tier, required to unlock Premium)
                </label>
                <input
                  id="analyzer-email"
                  className="text-input"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@example.com"
                />
              </div>
              <div className="email-notice">
                {subscriptionInfo?.is_premium ? (
                  <span className="status-pill premium">Unlimited checks enabled</span>
                ) : (
                  <span className="status-pill free">3 Free checks per day</span>
                )}
              </div>
            </div>

            <div className="actions-row">
              <button className="primary-button analyze-btn" onClick={handleAnalyze} disabled={loading} type="button">
                {loading ? 'Analyzing match...' : 'Analyze Match Score'}
              </button>
              <p className="hint">Your resume text stays inside this browser session for instant processing.</p>
            </div>

            {error && <div className="alert error">{error}</div>}

            {/* Analysis Result Card */}
            {result && (
              <section className="result-card">
                <div className="result-top">
                  <div className="result-summary">
                    <span className="section-label">Analysis Result</span>
                    <h2>{scoreLabel}</h2>
                    <p>
                      Your resume matches the role at <strong>{overallScore}/100</strong>. Free checks left today:{' '}
                      <strong>{result.is_premium ? 'Unlimited' : result.remaining_today}</strong>.
                    </p>
                    {scoreExplanation && <p className="result-explanation">{scoreExplanation}</p>}
                    <div className="result-progress-block" aria-label="Overall match progress">
                      <div className="progress-label-row">
                        <span>Match rating</span>
                        <strong>{overallScore}%</strong>
                      </div>
                      <div className="progress-track">
                        <div className="progress-fill" style={{ width: `${overallScore}%` }} />
                      </div>
                    </div>
                  </div>

                  <div className="score-ring" style={{ '--score': `${overallScore}%` }}>
                    <span>{overallScore}</span>
                    <small>/100</small>
                  </div>
                </div>

                <div className="result-badges" aria-label="Match summary badges">
                  <span className="summary-badge">Best match: {bestMatchingSkill}</span>
                  <span className="summary-badge muted-badge">Main gap: {primaryGap}</span>
                  <span className="summary-badge accent-badge">{evaluatedCoverageLabel}</span>
                </div>

                {categoryScores.length > 0 && (
                  <section className="result-section">
                    <div className="section-head">
                      <h3>Category Scores</h3>
                      <p>Breakdown across core evaluation factors.</p>
                    </div>
                    <div className="category-grid">
                      {categoryScores.map((item, index) => (
                        <article className="category-card" key={`${item.category || item.name || 'category'}-${index}`}>
                          <div className="category-card-head">
                            <strong>{item.category || item.name || 'Category'}</strong>
                            <span>{typeof item.score === 'number' ? item.score : Number(item.score) || 0}/100</span>
                          </div>
                          <div className="mini-progress" aria-hidden="true">
                            <div
                              className="mini-progress-fill"
                              style={{ width: `${typeof item.score === 'number' ? item.score : Number(item.score) || 0}%` }}
                            />
                          </div>
                          <p>{item.explanation || item.reason || 'No explanation provided.'}</p>
                        </article>
                      ))}
                    </div>
                  </section>
                )}

                <div className="result-grid">
                  <article className="result-section">
                    <div className="section-head">
                      <h3>Matching Skills</h3>
                      <p>Key requirements found in your CV.</p>
                    </div>
                    {matchingSkills.length ? (
                      <ul className="chips-list">
                        {matchingSkills.map((skill, index) => (
                          <li key={`${skill}-${index}`}>{skill}</li>
                        ))}
                      </ul>
                    ) : (
                      <p className="muted">No matching skills were returned.</p>
                    )}
                  </article>

                  <article className="result-section">
                    <div className="section-head">
                      <h3>Missing Keywords & Skills</h3>
                      <p>Important keywords from the job listing not clearly spotted in your CV.</p>
                    </div>
                    {missingSkills.length ? (
                      <ul className="chips-list missing">
                        {missingSkills.map((skill, index) => (
                          <li key={`${skill}-${index}`}>{skill}</li>
                        ))}
                      </ul>
                    ) : (
                      <p className="muted">No clear keyword gaps were returned.</p>
                    )}
                  </article>

                  <article className="result-section">
                    <div className="section-head">
                      <h3>Critical Missing Requirements</h3>
                      <p>Key gaps that could trigger automated ATS filters.</p>
                    </div>
                    {criticalMissingRequirements.length ? (
                      <ul className="result-list">
                        {criticalMissingRequirements.map((item, index) => (
                          <li key={`${item}-${index}`}>{item}</li>
                        ))}
                      </ul>
                    ) : (
                      <p className="muted">No critical missing requirements highlighted.</p>
                    )}
                  </article>

                  <article className="result-section">
                    <div className="section-head">
                      <h3>Quick Actionable Tips</h3>
                      <p>Immediate steps to boost your match score.</p>
                    </div>
                    {quickTips.length ? (
                      <ol className="tips-list">
                        {quickTips.map((tip, index) => (
                          <li key={`${tip}-${index}`}>{tip}</li>
                        ))}
                      </ol>
                    ) : (
                      <p className="muted">No tips returned.</p>
                    )}
                  </article>

                  <article className="result-section full-width">
                    <div className="section-head">
                      <h3>CV Improvement Suggestions</h3>
                      <p>Specific sentence and content enhancements for your target application.</p>
                    </div>
                    {improvementSuggestions.length ? (
                      <ul className="result-list">
                        {improvementSuggestions.map((item, index) => (
                          <li key={`${item}-${index}`}>{item}</li>
                        ))}
                      </ul>
                    ) : (
                      <p className="muted">No CV improvement suggestions were returned.</p>
                    )}
                  </article>
                </div>

                <div className="warning-box">
                  <strong>Important Notice</strong>
                  <p>{warningMessage}</p>
                </div>
              </section>
            )}
          </div>
        </section>

        {/* Example Result Showcase Section */}
        <section id="example-result" className="landing-section">
          <div className="section-header">
            <span className="section-label">Realistic Example</span>
            <h2>See what your match analysis report looks like</h2>
            <p>Clear, structured feedback without fluff or confusion.</p>
          </div>

          <div className="example-result-card">
            <div className="example-header">
              <div>
                <span className="example-role">Senior Frontend Engineer Role</span>
                <h3>Target Application: Tech Startup Inc.</h3>
              </div>
              <div className="example-score-badge">
                <span className="score-num">82</span>
                <span className="score-den">/100</span>
                <span className="score-status">Strong Match</span>
              </div>
            </div>

            <div className="example-grid">
              <div className="example-box">
                <h4>✓ Matched Keywords & Skills</h4>
                <div className="chips-list">
                  <span>React.js</span>
                  <span>JavaScript (ES6+)</span>
                  <span>CSS Modules</span>
                  <span>REST APIs</span>
                  <span>Git Workflow</span>
                </div>
              </div>

              <div className="example-box warning-box-subtle">
                <h4>⚠️ Missing Keywords & Gaps</h4>
                <div className="chips-list missing">
                  <span>React Query</span>
                  <span>CI/CD Pipelines</span>
                  <span>TypeScript</span>
                  <span>Jest / Unit Testing</span>
                </div>
              </div>
            </div>

            <div className="example-tips">
              <h4>⚡ Practical Recommendations</h4>
              <ul>
                <li>Add explicit metrics to experience bullets (e.g. "Improved load speed by 28%").</li>
                <li>Incorporate "React Query" under your state management section if you have experience with it.</li>
                <li>Explicitly state experience with "CI/CD Pipelines" rather than generic "deployment tools".</li>
              </ul>
            </div>
          </div>
        </section>

        {/* Benefits Section */}
        <section id="benefits" className="landing-section">
          <div className="section-header">
            <span className="section-label">Product Benefits</span>
            <h2>Why candidates trust Resume Matcher</h2>
            <p>Get a competitive edge in your job and internship search.</p>
          </div>

          <div className="benefits-grid">
            <article className="benefit-card">
              <div className="benefit-icon">🎯</div>
              <h3>Bypass ATS Screeners</h3>
              <p>Identify missing exact-match keywords before automated filters discard your job application.</p>
            </article>

            <article className="benefit-card">
              <div className="benefit-icon">⚡</div>
              <h3>Tailor in Seconds</h3>
              <p>Save hours of manual tweaking. Get immediate clarity on what bullet points to update for every submission.</p>
            </article>

            <article className="benefit-card">
              <div className="benefit-icon">💡</div>
              <h3>Actionable Feedback</h3>
              <p>No generic advice. Receive clear, role-specific recommendations tailored to the actual job text.</p>
            </article>

            <article className="benefit-card">
              <div className="benefit-icon">🔒</div>
              <h3>Private & Security First</h3>
              <p>Your resume text is processed strictly on-demand. We do not store or sell your personal career data.</p>
            </article>
          </div>
        </section>

        {/* Pricing Section */}
        <section id="pricing" className="landing-section">
          <div className="section-header">
            <span className="section-label">Pricing</span>
            <h2>Simple, affordable plans for every job seeker</h2>
            <p>Start for free today, or upgrade for unlimited checks across all your applications.</p>
          </div>

          <div className="pricing-grid">
            {/* Free Tier Card */}
            <article className="pricing-card">
              <div className="pricing-badge">Free Plan</div>
              <h3>Basic Trial</h3>
              <div className="price-tag">
                <span className="amount">$0</span>
                <span className="period">/ forever</span>
              </div>
              <p className="pricing-desc">Perfect for students and graduates testing their CV against a few targeted roles.</p>
              <ul className="pricing-features">
                <li>✓ 3 CV checks per day (per IP)</li>
                <li>✓ Overall match score</li>
                <li>✓ Missing keywords breakdown</li>
                <li>✓ Quick actionable tips</li>
                <li>✓ No credit card required</li>
              </ul>
              <button className="ghost-button pricing-cta" onClick={() => scrollToSection('workspace')} type="button">
                Use Free Analyzer
              </button>
            </article>

            {/* Premium Tier Card */}
            <article className="pricing-card featured">
              <div className="pricing-badge popular">Most Popular</div>
              <h3>Unlimited Premium</h3>
              <div className="price-tag">
                <span className="amount">$10</span>
                <span className="period">/ month</span>
              </div>
              <p className="pricing-desc">Designed for active job seekers applying to multiple positions every week.</p>
              <ul className="pricing-features">
                <li>✓ <strong>Unlimited checks</strong> every day</li>
                <li>✓ Detailed category score breakdowns</li>
                <li>✓ Priority processing speed</li>
                <li>✓ Comprehensive rewrite suggestions</li>
                <li>✓ Self-service customer portal</li>
              </ul>

              <div className="pricing-form-block">
                <label className="field">
                  <span>Enter email to unlock or check access</span>
                  <input
                    className="text-input"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="you@example.com"
                  />
                </label>

                <div className="subscription-actions">
                  <button className="primary-button pricing-cta" onClick={openCheckout} type="button">
                    Upgrade to Premium ($10/mo)
                  </button>
                  <button
                    className="ghost-button"
                    onClick={refreshSubscriptionStatus}
                    disabled={subscriptionLoading}
                    type="button"
                  >
                    {subscriptionLoading ? 'Checking...' : 'Refresh Status'}
                  </button>
                  {LEMON_SQUEEZY_PORTAL_URL && (
                    <button className="ghost-button" onClick={openCustomerPortal} type="button">
                      Manage Portal
                    </button>
                  )}
                </div>

                {checkoutNotice && <div className="alert success">{checkoutNotice}</div>}
                {subscriptionMessage && <div className="alert info">{subscriptionMessage}</div>}
                {subscriptionError && <div className="alert error">{subscriptionError}</div>}
              </div>
            </article>
          </div>
        </section>

        {/* FAQ Section */}
        <section id="faq" className="landing-section">
          <div className="section-header">
            <span className="section-label">FAQ</span>
            <h2>Frequently Asked Questions</h2>
            <p>Everything you need to know about Resume Matcher.</p>
          </div>

          <div className="faq-accordion">
            {faqItems.map((item, index) => {
              const isOpen = openFaq === index
              return (
                <div key={index} className={`faq-item ${isOpen ? 'open' : ''}`}>
                  <button
                    className="faq-question"
                    onClick={() => setOpenFaq(isOpen ? null : index)}
                    type="button"
                    aria-expanded={isOpen}
                  >
                    <span>{item.q}</span>
                    <span className="faq-icon">{isOpen ? '−' : '+'}</span>
                  </button>
                  {isOpen && <div className="faq-answer">{item.a}</div>}
                </div>
              )
            })}
          </div>
        </section>

        {/* Final CTA Banner */}
        <section className="final-cta-banner">
          <div className="cta-content">
            <h2>Ready to stop applying blindly?</h2>
            <p>Paste your CV and target job description now to see your AI match score in seconds.</p>
            <button className="primary-button final-cta-btn" onClick={() => scrollToSection('workspace')} type="button">
              Check My CV For Free
            </button>
          </div>
        </section>
      </main>

      {/* Footer */}
      <footer className="landing-footer">
        <div className="footer-container">
          <div className="footer-brand">
            <div className="nav-brand">
              <span className="brand-logo">⚡</span>
              <span className="brand-name">Resume Matcher</span>
            </div>
            <p className="footer-tagline">Empowering candidates to tailor applications and pass ATS filters.</p>
            <p className="copyright">© {new Date().getFullYear()} Resume Matcher SaaS. All rights reserved.</p>
          </div>

          <div className="footer-links">
            <div className="footer-col">
              <h4>Product</h4>
              <button onClick={() => scrollToSection('how-it-works')} type="button" className="footer-link-btn">
                How It Works
              </button>
              <button onClick={() => scrollToSection('workspace')} type="button" className="footer-link-btn">
                AI Analyzer
              </button>
              <button onClick={() => scrollToSection('pricing')} type="button" className="footer-link-btn">
                Pricing
              </button>
            </div>

            <div className="footer-col">
              <h4>Legal & Support</h4>
              <button onClick={() => setActiveModal('privacy')} type="button" className="footer-link-btn">
                Privacy Policy
              </button>
              <button onClick={() => setActiveModal('terms')} type="button" className="footer-link-btn">
                Terms of Service
              </button>
              <button onClick={() => setActiveModal('contact')} type="button" className="footer-link-btn">
                Contact Support
              </button>
            </div>
          </div>
        </div>
      </footer>

      {/* Modals for Privacy, Terms, and Contact */}
      {activeModal && (
        <div className="modal-overlay" onClick={() => setActiveModal(null)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>
                {activeModal === 'privacy' && 'Privacy Policy'}
                {activeModal === 'terms' && 'Terms of Service'}
                {activeModal === 'contact' && 'Contact Support'}
              </h3>
              <button className="modal-close" onClick={() => setActiveModal(null)} type="button">
                ✕
              </button>
            </div>

            <div className="modal-body">
              {activeModal === 'privacy' && (
                <div className="policy-text">
                  <p>
                    <strong>Your Privacy Matters.</strong> At Resume Matcher, we respect your data and privacy.
                  </p>
                  <h4>1. Data Collection</h4>
                  <p>
                    We process resume and job description text strictly on-demand to compute match scores and keyword analysis.
                    We do not store your uploaded resume text permanently or share it with third parties.
                  </p>
                  <h4>2. Email Usage</h4>
                  <p>
                    If you provide an email address, it is used solely to verify active subscriptions and process billing status via Lemon Squeezy.
                  </p>
                  <h4>3. Cookies & Analytics</h4>
                  <p>We use essential cookies to manage your browser session and daily rate limits.</p>
                </div>
              )}

              {activeModal === 'terms' && (
                <div className="policy-text">
                  <p>
                    <strong>Terms of Service.</strong> By using Resume Matcher, you agree to these terms.
                  </p>
                  <h4>1. Acceptable Use</h4>
                  <p>
                    Resume Matcher is designed to assist job seekers with keyword matching and application tailoring. You agree not to abuse rate limits or use the service for unauthorized automated scraping.
                  </p>
                  <h4>2. Disclaimers</h4>
                  <p>
                    Resume Matcher provides automated AI suggestions based on text comparison. We do not guarantee interview calls or job offers, as hiring decisions remain entirely with employers.
                  </p>
                  <h4>3. Subscription & Billing</h4>
                  <p>
                    Premium subscriptions ($10/mo) are managed securely via Lemon Squeezy and can be canceled at any time in your portal.
                  </p>
                </div>
              )}

              {activeModal === 'contact' && (
                <div className="contact-modal-body">
                  {contactForm.submitted ? (
                    <div className="alert success">
                      Thank you! Your message has been sent. Our team will get back to you shortly.
                    </div>
                  ) : (
                    <form
                      onSubmit={(e) => {
                        e.preventDefault()
                        setContactForm({ ...contactForm, submitted: true })
                      }}
                      className="contact-form"
                    >
                      <label className="field">
                        <span>Your Name</span>
                        <input
                          type="text"
                          required
                          className="text-input"
                          value={contactForm.name}
                          onChange={(e) => setContactForm({ ...contactForm, name: e.target.value })}
                          placeholder="Jane Doe"
                        />
                      </label>
                      <label className="field">
                        <span>Your Email</span>
                        <input
                          type="email"
                          required
                          className="text-input"
                          value={contactForm.email}
                          onChange={(e) => setContactForm({ ...contactForm, email: e.target.value })}
                          placeholder="jane@example.com"
                        />
                      </label>
                      <label className="field">
                        <span>Message</span>
                        <textarea
                          rows="4"
                          required
                          className="text-input"
                          value={contactForm.message}
                          onChange={(e) => setContactForm({ ...contactForm, message: e.target.value })}
                          placeholder="How can we help you?"
                        />
                      </label>
                      <button type="submit" className="primary-button">
                        Send Message
                      </button>
                    </form>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
            <Analytics />

    </div>
  )
}

export default App