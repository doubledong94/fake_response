from fastapi import FastAPI, Request
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates
from fastapi.responses import HTMLResponse
import os

from api.routes import router as api_router

# 创建FastAPI应用
app = FastAPI(
    title="MitmProxy Manager",
    description="MitmProxy Web管理界面",
    version="1.0.0"
)

# 挂载静态文件
app.mount("/static", StaticFiles(directory="frontend/static"), name="static")

# 配置模板
templates = Jinja2Templates(directory="frontend")

# 注册API路由
app.include_router(api_router, prefix="/api", tags=["API"])

@app.get("/", response_class=HTMLResponse)
async def read_root(request: Request):
    """主页面"""
    return templates.TemplateResponse("index.html", {"request": request})

@app.get("/health")
async def health_check():
    """健康检查"""
    return {"status": "ok", "message": "MitmProxy Manager is running"}

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000, reload=True)