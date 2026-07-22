from fastapi import FastAPI, Request, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
from groq import Groq
from datetime import datetime, timedelta
import hashlib
import hmac
import logging
import os
import json
import sqlite3
from typing import Optional

from dotenv import load_dotenv

load_dotenv()

logger = logging.getLogger(__name__)

DB_PATH = os.getenv("SQLITE_PATH", os.path.join(os.path.dirname(__file__), "subscriptions.db"))

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

# Simple in-memory store: { ip_address: {"count": X, "reset_at": datetime} }
usage_tracker = {}
FREE_DAILY_LIMIT = 3


class MatchRequest(BaseModel):
    resume: str
    job_description: str
    email: Optional[str] = None


class CategoryScore(BaseModel):
    category: str
    score: int
    explanation: str


class AnalysisResponse(BaseModel):
    overall_match_score: int = 0
    score_explanation: str = ""
    category_scores: list[CategoryScore] = Field(default_factory=list)
    matching_skills: list[str] = Field(default_factory=list)
    missing_skills: list[str] = Field(default_factory=list)
    critical_missing_requirements: list[str] = Field(default_factory=list)
    quick_tips: list[str] = Field(default_factory=list)
    cv_improvement_suggestions: list[str] = Field(default_factory=list)
    warning: str = ""
    score: int = 0
    missing_keywords: list[str] = Field(default_factory=list)
    tips: list[str] = Field(default_factory=list)
    remaining_today: Optional[int] = None
    is_premium: bool = False
    subscription_status: str = "free"


class SubscriptionRequest(BaseModel):
    email: str


class MatchResponse(BaseModel):
    score: int
    missing_keywords: list[str]
    tips: list[str]
    remaining_today: Optional[int]
    is_premium: bool = False
    subscription_status: str = "free"


class SubscriptionStatusResponse(BaseModel):
    email: str
    is_premium: bool
    subscription_status: str
    current_period_end: Optional[str] = None


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


def normalize_email(email: Optional[str]) -> Optional[str]:
    if email is None:
        return None
    normalized = email.strip().lower()
    return normalized or None


def get_frontend_origin() -> str:
    origins = [
        origin.strip().rstrip("/")
        for origin in os.getenv("FRONTEND_ORIGINS", "").split(",")
        if origin.strip() and origin.strip() != "*"
    ]
    if origins:
        return origins[0]
    return os.getenv("DEFAULT_FRONTEND_ORIGIN", "http://localhost:5173").rstrip("/")


def init_db() -> None:
    with sqlite3.connect(DB_PATH) as connection:
        connection.execute(
            """
            CREATE TABLE IF NOT EXISTS premium_users (
                email TEXT PRIMARY KEY,
                subscription_status TEXT NOT NULL,
                is_premium INTEGER NOT NULL DEFAULT 0,
                current_period_end TEXT,
                updated_at TEXT NOT NULL
            )
            """
        )
        connection.commit()


init_db()


def get_db_connection() -> sqlite3.Connection:
    connection = sqlite3.connect(DB_PATH)
    connection.row_factory = sqlite3.Row
    return connection


def upsert_subscription(
    *,
    email: Optional[str],
    subscription_status: str = "free",
    is_premium: bool = False,
    current_period_end: Optional[str] = None,
) -> None:
    normalized_email = normalize_email(email)
    if not normalized_email:
        return

    with get_db_connection() as connection:
        connection.execute(
            """
            INSERT INTO premium_users (
                email,
                subscription_status,
                is_premium,
                current_period_end,
                updated_at
            )
            VALUES (?, ?, ?, ?, ?)
            ON CONFLICT(email) DO UPDATE SET
                subscription_status=excluded.subscription_status,
                is_premium=excluded.is_premium,
                current_period_end=excluded.current_period_end,
                updated_at=excluded.updated_at
            """,
            (
                normalized_email,
                subscription_status,
                1 if is_premium else 0,
                current_period_end,
                datetime.utcnow().isoformat(),
            ),
        )
        connection.commit()


def get_subscription_record_by_email(email: Optional[str]):
    normalized_email = normalize_email(email)
    if not normalized_email:
        return None

    with get_db_connection() as connection:
        row = connection.execute(
            "SELECT * FROM premium_users WHERE email = ?",
            (normalized_email,),
        ).fetchone()

    return row


def row_to_subscription_response(row, email: str) -> SubscriptionStatusResponse:
    return SubscriptionStatusResponse(
        email=email,
        is_premium=bool(row["is_premium"]),
        subscription_status=row["subscription_status"],
        current_period_end=row["current_period_end"],
    )


def sync_premium_user(
    *,
    email: Optional[str],
    subscription_status: str = "active",
    is_premium: bool = True,
    current_period_end: Optional[str] = None,
) -> None:
    upsert_subscription(
        email=email,
        subscription_status=subscription_status,
        is_premium=is_premium,
        current_period_end=current_period_end,
    )


def get_subscription_status(email: Optional[str]) -> SubscriptionStatusResponse:
    normalized_email = normalize_email(email)
    if not normalized_email:
        return SubscriptionStatusResponse(
            email="",
            is_premium=False,
            subscription_status="free",
        )

    db_record = get_subscription_record_by_email(normalized_email)
    if db_record:
        return row_to_subscription_response(db_record, normalized_email)

    return SubscriptionStatusResponse(
        email=normalized_email,
        is_premium=False,
        subscription_status="free",
    )


def verify_lemonsqueezy_signature(payload: bytes, signature: Optional[str]) -> bool:
    webhook_secret = os.getenv("LEMONSQUEEZY_WEBHOOK_SECRET")
    if not webhook_secret or not signature:
        return False

    normalized_signature = signature.strip()
    if normalized_signature.startswith("sha256="):
        normalized_signature = normalized_signature.removeprefix("sha256=").strip()

    digest = hmac.new(
        webhook_secret.encode("utf-8"),
        payload,
        hashlib.sha256,
    ).hexdigest()

    return hmac.compare_digest(digest, normalized_signature)


def extract_lemonsqueezy_email(event: dict) -> Optional[str]:
    data = event.get("data", {}) if isinstance(event, dict) else {}
    attributes = data.get("attributes", {}) if isinstance(data, dict) else {}
    meta = event.get("meta", {}) if isinstance(event, dict) else {}
    custom_data = meta.get("custom_data", {}) if isinstance(meta, dict) else {}

    return normalize_email(
        attributes.get("user_email")
        or attributes.get("email")
        or custom_data.get("email")
    )


def get_groq_client() -> Groq:
    api_key = os.getenv("GROQ_API_KEY")
    if not api_key:
        raise HTTPException(
            status_code=500,
            detail="GROQ_API_KEY is not configured on the server."
        )
    return Groq(api_key=api_key)


PROMPT_TEMPLATE = """
You are a precise ATS resume analyzer.

Compare the RESUME against the JOB DESCRIPTION and return ONLY valid JSON.

Rules:
- Do not invent skills, experience, education, certifications, or tools.
- Only include category scores when the category can be evaluated reliably from the provided text.
- If evidence is weak or missing, omit that category or use an empty array.
- Keep explanations brief, concrete, and grounded in the text.
- The warning must explain that missing keywords do not always mean the candidate lacks the skill.

Return JSON in this exact structure:
{{
  "overall_match_score": <number 0-100>,
  "score_explanation": "short explanation of the score",
  "category_scores": [
    {{"category": "Skills match", "score": 0, "explanation": "..."}},
    {{"category": "Experience match", "score": 0, "explanation": "..."}},
    {{"category": "Keywords match", "score": 0, "explanation": "..."}},
    {{"category": "Education/qualification match", "score": 0, "explanation": "..."}},
    {{"category": "Tools/technologies match", "score": 0, "explanation": "..."}}
  ],
  "matching_skills": ["skill 1", "skill 2"],
  "missing_skills": ["skill 1", "skill 2"],
  "critical_missing_requirements": ["requirement 1", "requirement 2"],
  "quick_tips": ["tip 1", "tip 2", "tip 3"],
  "cv_improvement_suggestions": ["suggestion 1", "suggestion 2"],
  "warning": "short warning about keyword limitations"
}}

Only include categories in category_scores when you can support the score from the provided data. If a category cannot be evaluated reliably, leave it out.

RESUME:
{resume}

JOB DESCRIPTION:
{job_description}
"""


def clamp_score(value) -> int:
    try:
        return max(0, min(100, int(value)))
    except (TypeError, ValueError):
        return 0


def normalize_text_list(value, *, limit: Optional[int] = None) -> list[str]:
    if not isinstance(value, list):
        return []

    normalized: list[str] = []
    for item in value:
        text = str(item).strip()
        if text:
            normalized.append(text)
        if limit is not None and len(normalized) >= limit:
            break
    return normalized


def normalize_category_scores(value) -> list[dict[str, object]]:
    if not isinstance(value, list):
        return []

    normalized: list[dict[str, object]] = []
    for item in value:
        if not isinstance(item, dict):
            continue

        category = str(item.get("category") or item.get("name") or item.get("title") or "").strip()
        explanation = str(item.get("explanation") or item.get("reason") or "").strip()
        if not category or not explanation:
            continue

        normalized.append(
            {
                "category": category,
                "score": clamp_score(item.get("score", 0)),
                "explanation": explanation,
            }
        )

    return normalized


def normalize_analysis_result(result: dict) -> dict:
    overall_score = clamp_score(result.get("overall_match_score", result.get("score", 0)))
    matching_skills = normalize_text_list(result.get("matching_skills"), limit=10)
    missing_skills = normalize_text_list(result.get("missing_skills"), limit=10)
    critical_missing_requirements = normalize_text_list(
        result.get("critical_missing_requirements"),
        limit=5,
    )
    quick_tips = normalize_text_list(result.get("quick_tips"), limit=5)
    cv_improvement_suggestions = normalize_text_list(
        result.get("cv_improvement_suggestions"),
        limit=5,
    )

    normalized_result = {
        "overall_match_score": overall_score,
        "score_explanation": str(result.get("score_explanation") or "").strip(),
        "category_scores": normalize_category_scores(result.get("category_scores")),
        "matching_skills": matching_skills,
        "missing_skills": missing_skills,
        "critical_missing_requirements": critical_missing_requirements,
        "quick_tips": quick_tips,
        "cv_improvement_suggestions": cv_improvement_suggestions,
        "warning": str(result.get("warning") or "").strip(),
        "score": overall_score,
        "missing_keywords": normalize_text_list(
            result.get("missing_keywords") or missing_skills,
            limit=10,
        ),
        "tips": quick_tips,
    }

    return normalized_result


@app.post("/analyze")
def analyze(data: MatchRequest, request: Request):
    client_ip = get_client_ip(request)
    now = datetime.utcnow()
    subscription_status = get_subscription_status(data.email)
    is_premium = subscription_status.is_premium

    if not is_premium:
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
        client = get_groq_client()
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

    if not isinstance(result, dict):
        raise HTTPException(
            status_code=502,
            detail="AI analysis returned an invalid JSON structure."
        )

    result = normalize_analysis_result(result)
    result["remaining_today"] = None if is_premium else FREE_DAILY_LIMIT - usage_tracker[client_ip]["count"]
    result["is_premium"] = is_premium
    result["subscription_status"] = subscription_status.subscription_status

    return AnalysisResponse(**result)


@app.get("/subscription/status")
def subscription_status(email: str):
    return get_subscription_status(email)


@app.post("/webhook/lemonsqueezy")
async def lemonsqueezy_webhook(request: Request):
    payload = await request.body()
    signature = request.headers.get("x-signature")
    event_name = request.headers.get("x-event-name")

    if not verify_lemonsqueezy_signature(payload, signature):
        logger.warning(
            "Rejected Lemon Squeezy webhook: missing_or_invalid_signature event=%s has_signature=%s has_secret=%s",
            event_name,
            bool(signature),
            bool(os.getenv("LEMONSQUEEZY_WEBHOOK_SECRET")),
        )
        raise HTTPException(status_code=400, detail="Invalid Lemon Squeezy webhook signature.")

    try:
        event = json.loads(payload.decode("utf-8"))
    except json.JSONDecodeError as exc:
        raise HTTPException(status_code=400, detail="Invalid Lemon Squeezy webhook payload.") from exc

    normalized_event_name = (event_name or event.get("meta", {}).get("event_name") or "").strip()
    email = extract_lemonsqueezy_email(event)
    data = event.get("data", {}) if isinstance(event, dict) else {}
    attributes = data.get("attributes", {}) if isinstance(data, dict) else {}

    if normalized_event_name in {"order_created", "subscription_created"} and email:
        current_period_end = attributes.get("renews_at") or attributes.get("ends_at") or attributes.get("trial_ends_at")
        sync_premium_user(
            email=email,
            subscription_status="active",
            is_premium=True,
            current_period_end=current_period_end,
        )
    elif normalized_event_name in {"subscription_updated", "subscription_cancelled", "subscription_expired"} and email:
        status = str(attributes.get("status", "inactive")).lower()
        is_premium = status in {"active", "trialing"}
        current_period_end = attributes.get("renews_at") or attributes.get("ends_at")
        sync_premium_user(
            email=email,
            subscription_status=status or "inactive",
            is_premium=is_premium,
            current_period_end=current_period_end,
        )

    return {"received": True}


@app.get("/")
def health_check():
    return {"status": "ok"}