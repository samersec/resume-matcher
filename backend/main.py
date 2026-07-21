from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from groq import Groq
import os
import json
from dotenv import load_dotenv

load_dotenv()

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

client = Groq(api_key=os.getenv("GROQ_API_KEY"))

class MatchRequest(BaseModel):
    resume: str
    job_description: str

PROMPT_TEMPLATE = """
You are an ATS (Applicant Tracking System) resume analyzer.

Compare the RESUME below against the JOB DESCRIPTION.

Return ONLY valid JSON in this exact format, no other text:
{{
  "score": <number 0-100>,
  "missing_keywords": ["keyword1", "keyword2", "keyword3"],
  "tips": ["tip1", "tip2", "tip3"]
}}

RESUME:
{resume}

JOB DESCRIPTION:
{job_description}
"""

@app.post("/analyze")
def analyze(data: MatchRequest):
    prompt = PROMPT_TEMPLATE.format(
        resume=data.resume,
        job_description=data.job_description
    )

    completion = client.chat.completions.create(
        model="llama-3.3-70b-versatile",
        messages=[{"role": "user", "content": prompt}],
        temperature=0.3,
    )

    raw_output = completion.choices[0].message.content

    try:
        result = json.loads(raw_output)
    except json.JSONDecodeError:
        start = raw_output.find("{")
        end = raw_output.rfind("}") + 1
        result = json.loads(raw_output[start:end])

    return result

@app.get("/")
def health_check():
    return {"status": "ok"}