import { useState } from 'react'
import './App.css'

function App() {
  const [resume, setResume] = useState('')
  const [jobDescription, setJobDescription] = useState('')
  const [result, setResult] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const handleAnalyze = async () => {
    if (!resume.trim() || !jobDescription.trim()) {
      setError('Please fill in both fields.')
      return
    }
    setError('')
    setLoading(true)
    setResult(null)

    try {
      const response = await fetch('http://127.0.0.1:8000/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ resume, job_description: jobDescription }),
      })

      if (!response.ok) throw new Error('Something went wrong.')

      const data = await response.json()
      setResult(data)
    } catch (err) {
      setError('Failed to analyze. Is the backend running?')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="container">
      <h1>Resume Matcher</h1>
      <p className="subtitle">Paste your resume and a job description to get your match score.</p>

      <div className="form">
        <div className="field">
          <label>Your Resume</label>
          <textarea
            rows="10"
            value={resume}
            onChange={(e) => setResume(e.target.value)}
            placeholder="Paste your resume text here..."
          />
        </div>

        <div className="field">
          <label>Job Description</label>
          <textarea
            rows="10"
            value={jobDescription}
            onChange={(e) => setJobDescription(e.target.value)}
            placeholder="Paste the job description here..."
          />
        </div>
      </div>

      <button onClick={handleAnalyze} disabled={loading}>
        {loading ? 'Analyzing...' : 'Analyze Match'}
      </button>

      {error && <p className="error">{error}</p>}

      {result && (
        <div className="result">
          <h2>Score: {result.score}/100</h2>

          <h3>Missing Keywords</h3>
          <ul>
            {result.missing_keywords.map((kw, i) => (
              <li key={i}>{kw}</li>
            ))}
          </ul>

          <h3>Tips</h3>
          <ul>
            {result.tips.map((tip, i) => (
              <li key={i}>{tip}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}

export default App