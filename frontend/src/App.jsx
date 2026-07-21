import { useMemo, useState } from 'react'
import './App.css'

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://127.0.0.1:8000'

const sampleResume = `Product designer and front-end engineer with 5+ years of experience building customer-facing web apps. Strong in React, accessibility, design systems, API integration, and rapid prototyping. Led launch of a self-serve dashboard that increased activation by 18%.

Experience highlights:
- Built responsive SaaS interfaces with React and TypeScript
- Collaborated with product and engineering to ship weekly releases
- Improved conversion through UX testing and iteration`

const sampleJob = `We are hiring a front-end engineer to build polished SaaS experiences. Required skills include React, JavaScript, CSS, accessibility, analytics, REST APIs, and strong communication. Nice to have: TypeScript, design systems, A/B testing, and product thinking.`

function App() {
  const [resume, setResume] = useState('')
  const [jobDescription, setJobDescription] = useState('')
  const [result, setResult] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const resumeWords = useMemo(() => resume.trim().split(/\s+/).filter(Boolean).length, [resume])
  const jobWords = useMemo(() => jobDescription.trim().split(/\s+/).filter(Boolean).length, [jobDescription])

  const fillSample = () => {
    setResume(sampleResume)
    setJobDescription(sampleJob)
    setError('')
  }

  const handleAnalyze = async () => {
    if (!resume.trim() || !jobDescription.trim()) {
      setError('Paste both your resume and the job description first.')
      return
    }

    setError('')
    setLoading(true)
    setResult(null)

    try {
      const response = await fetch(`${API_BASE_URL}/analyze`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ resume, job_description: jobDescription }),
      })

      const data = await response.json().catch(() => null)

      if (!response.ok) {
        const detail = data?.detail || 'Unable to analyze right now.'
        throw new Error(detail)
      }

      setResult(data)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to analyze. Check the backend connection.')
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
            tips in seconds.
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
            <li>Backend: FastAPI endpoint, LLM prompt, IP quota guard</li>
            <li>Deployable free on Vercel, Render, and Supabase later</li>
          </ul>
          <button className="ghost-button" onClick={fillSample} type="button">
            Load demo content
          </button>
        </aside>
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

        <div className="actions-row">
          <button className="primary-button" onClick={handleAnalyze} disabled={loading} type="button">
            {loading ? 'Analyzing match...' : 'Analyze match'}
          </button>
          <p className="hint">Frontend talks to {API_BASE_URL}</p>
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
                  <strong>{result.remaining_today}</strong>.
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