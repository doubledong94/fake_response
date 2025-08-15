from pydantic import BaseModel, Field
from typing import Dict, List, Optional, Any
from enum import Enum
import uuid

class HTTPMethod(str, Enum):
    GET = "GET"
    POST = "POST"
    PUT = "PUT"
    DELETE = "DELETE"
    PATCH = "PATCH"
    HEAD = "HEAD"
    OPTIONS = "OPTIONS"

class ResponseData(BaseModel):
    status: int = Field(default=200, ge=100, le=599)
    headers: Dict[str, str] = Field(default_factory=lambda: {"Content-Type": "application/json"})
    body: Any = Field(default_factory=dict)

class APIConfig(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    name: str = Field(..., min_length=1, max_length=100)
    url: str = Field(..., min_length=1)
    method: HTTPMethod = HTTPMethod.GET
    enabled: bool = True
    response: ResponseData = Field(default_factory=ResponseData)

class APIConfigList(BaseModel):
    apis: List[APIConfig] = Field(default_factory=list)

class ProxyStatus(BaseModel):
    running: bool
    ip: Optional[str] = None
    port: int = 8080
    pid: Optional[int] = None

class APICreateRequest(BaseModel):
    name: str = Field(..., min_length=1, max_length=100)
    url: str = Field(..., min_length=1)
    method: HTTPMethod = HTTPMethod.GET
    response: Optional[ResponseData] = None

class APIUpdateRequest(BaseModel):
    name: Optional[str] = Field(None, min_length=1, max_length=100)
    url: Optional[str] = Field(None, min_length=1)
    method: Optional[HTTPMethod] = None
    enabled: Optional[bool] = None
    response: Optional[ResponseData] = None