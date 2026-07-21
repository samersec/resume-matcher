from fastapi import FastAPI, Request, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from groq import Groq
from datetime import datetime, timedelta
import os
import json
from dotenv import load_dotenv

load_dotenv()

app = FastAPI()

frontend_origins = [
    origin.strip()
    for origin in os.getenv("FRONTEND_ORIGINS", "*").split(",")
    if origin.strip()
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=frontend_origins,
    allow_methods=["*"],
    allow_headers=["*"],
)

client = Groq(api_key=os.getenv("GROQ_API_KEY"))

# Simple in-memory store: { ip_address: {"count": X, "reset_at": datetime} }
usage_tracker = {}
FREE_DAILY_LIMIT = 3


class MatchRequest(BaseModel):
    resume: str
    job_description: str


class MatchResponse(BaseModel):
    score: int
    missing_keywords: list[str]
    tips: list[str]
    remaining_today: int


def get_client_ip(request: Request) -> str:
    forwarded_for = request.headers.get("x-forwarded-for")
    if forwarded_for:
        return forwarded_for.split(",")[0].strip()
    if request.client and request.client.host:
        return request.client.host
    return "unknown"


def parse_llm_json(raw_output: str) -> dict:
    try:
        return json.loads(raw_output)
    except json.JSONDecodeError:
        start = raw_output.find("{")
        end = raw_output.rfind("}") + 1
        if start >= 0 and end > start:
            return json.loads(raw_output[start:end])
        raise


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
def analyze(data: MatchRequest, request: Request):
    client_ip = get_client_ip(request)
    now = datetime.utcnow()

    # Initialize or reset tracker for this IP
    if client_ip not in usage_tracker or now > usage_tracker[client_ip]["reset_at"]:
        usage_tracker[client_ip] = {
            "count": 0,
            "reset_at": now + timedelta(days=1)
        }

    # Check limit
    if usage_tracker[client_ip]["count"] >= FREE_DAILY_LIMIT:
        raise HTTPException(
            status_code=429,
            detail="Daily free limit reached. Upgrade to premium for unlimited checks."
        )

    # Increment usage
    usage_tracker[client_ip]["count"] += 1

    prompt = PROMPT_TEMPLATE.format(
        resume=data.resume,
        job_description=data.job_description,
    )

    try:
        completion = client.chat.completions.create(
            model="llama-3.3-70b-versatile",
            messages=[{"role": "user", "content": prompt}],
            temperature=0.3,
        )
        raw_output = completion.choices[0].message.content or ""
        result = parse_llm_json(raw_output)
    except Exception as exc:
        raise HTTPException(
            status_code=502,
            detail=f"AI analysis failed: {exc.__class__.__name__}"
        ) from exc

    result["score"] = max(0, min(100, int(result.get("score", 0))))
    result["missing_keywords"] = [str(item) for item in result.get("missing_keywords", [])][:10]
    result["tips"] = [str(item) for item in result.get("tips", [])][:5]
    result["remaining_today"] = FREE_DAILY_LIMIT - usage_tracker[client_ip]["count"]

    return MatchResponse(**result)


@app.get("/")
def health_check():
    return {"status": "ok"}