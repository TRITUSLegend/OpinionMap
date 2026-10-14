from typing import List, Literal, Optional
from pydantic import BaseModel, Field, field_validator

MAX_HISTORY_TURNS = 6
MAX_TURN_CHARS = 1000


class HistoryTurn(BaseModel):
    role: Literal["user", "assistant"]
    # Hard limit against absurd payloads; anything longer than MAX_TURN_CHARS
    # is truncated rather than rejected.
    content: str = Field(max_length=20_000)

    @field_validator("content")
    @classmethod
    def truncate(cls, value: str) -> str:
        return value[:MAX_TURN_CHARS]


class AskRequest(BaseModel):
    question: str = Field(min_length=1, max_length=500)
    history: List[HistoryTurn] = Field(default_factory=list, max_length=50)

    @field_validator("question")
    @classmethod
    def not_blank(cls, value: str) -> str:
        value = value.strip()
        if not value:
            raise ValueError("Please type a question.")
        return value

    @field_validator("history")
    @classmethod
    def keep_recent(cls, value: List[HistoryTurn]) -> List[HistoryTurn]:
        return value[-MAX_HISTORY_TURNS:]


class Citation(BaseModel):
    id: int
    source: str
    text: str
    sentiment_label: Optional[str] = None
    simulated: bool
    url: Optional[str] = None


class AskResponse(BaseModel):
    answer_status: Literal["answered", "partial", "not_covered"]
    answer: str
    citations: List[Citation]
    retrieved_count: int


class AskStatusResponse(BaseModel):
    indexed: bool
    chunk_count: int
    chunk_total: int
    indexing: bool
    simulated_share: float
    item_count: int
    workflow_status: str
    query: str
