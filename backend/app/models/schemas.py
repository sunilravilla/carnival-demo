from pydantic import BaseModel
from typing import List, Optional

class Message(BaseModel):
    role: str
    content: str

class ConversationRequest(BaseModel):
    text: str

class ConversationResponse(BaseModel):
    user_text: str
    bot_text: str
    video_url: Optional[str] = None  # Optional for Voice mode
    audio_url: Optional[str] = None  # Audio URL for Voice mode
