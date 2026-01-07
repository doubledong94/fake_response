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

class FileDownloadConfig(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    name: str = Field(..., min_length=1, max_length=100)
    url_pattern: str = Field(..., min_length=1)
    local_file_path: str = Field(..., min_length=1)
    content_type: Optional[str] = None
    enabled: bool = True

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

class FileDownloadCreateRequest(BaseModel):
    name: str = Field(..., min_length=1, max_length=100)
    url_pattern: str = Field(..., min_length=1)
    local_file_path: str = Field(..., min_length=1)
    content_type: Optional[str] = None

class FileDownloadUpdateRequest(BaseModel):
    name: Optional[str] = Field(None, min_length=1, max_length=100)
    url_pattern: Optional[str] = Field(None, min_length=1)
    local_file_path: Optional[str] = Field(None, min_length=1)
    content_type: Optional[str] = None
    enabled: Optional[bool] = None

class RequestMappingConfig(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    name: str = Field(..., min_length=1, max_length=100)
    url_pattern: str = Field(..., min_length=1)
    target_host: str = Field(default="localhost")
    target_port: int = Field(..., ge=1, le=65535)
    methods: List[HTTPMethod] = Field(default_factory=lambda: [HTTPMethod.GET, HTTPMethod.POST])
    enabled: bool = True

class RequestMappingCreateRequest(BaseModel):
    name: str = Field(..., min_length=1, max_length=100)
    url_pattern: str = Field(..., min_length=1)
    target_host: str = Field(default="localhost")
    target_port: int = Field(..., ge=1, le=65535)
    methods: List[HTTPMethod] = Field(default_factory=lambda: [HTTPMethod.GET, HTTPMethod.POST])

class RequestMappingUpdateRequest(BaseModel):
    name: Optional[str] = Field(None, min_length=1, max_length=100)
    url_pattern: Optional[str] = Field(None, min_length=1)
    target_host: Optional[str] = None
    target_port: Optional[int] = Field(None, ge=1, le=65535)
    methods: Optional[List[HTTPMethod]] = None
    enabled: Optional[bool] = None

class CapturedRequest(BaseModel):
    """抓包请求数据模型"""
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    timestamp: float
    method: str
    url: str
    host: str
    path: str
    headers: Dict[str, str]
    query_params: str = ""
    request_body: str = ""
    request_size: int = 0

class CapturedResponse(BaseModel):
    """抓包响应数据模型"""
    status_code: int
    headers: Dict[str, str]
    response_body: str = ""
    response_size: int = 0
    duration: float = 0  # 响应时间（毫秒）

class CapturedFlow(BaseModel):
    """完整的抓包数据流"""
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    timestamp: float
    request: CapturedRequest
    response: Optional[CapturedResponse] = None