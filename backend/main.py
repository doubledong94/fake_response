from fastapi import FastAPI, Request, WebSocket, WebSocketDisconnect
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates
from fastapi.responses import HTMLResponse
import os
import asyncio
import json
from typing import List

from api.routes import router as api_router

# 创建FastAPI应用
app = FastAPI(
    title="MitmProxy Manager",
    description="MitmProxy Web管理界面",
    version="1.0.0"
)

# WebSocket连接管理
class ConnectionManager:
    def __init__(self):
        self.active_connections: List[WebSocket] = []
        self.capture_file = "./data/realtime_capture.json"
        self.last_position = 0  # 记录上次读取的文件位置

    async def connect(self, websocket: WebSocket):
        await websocket.accept()
        self.active_connections.append(websocket)

    def disconnect(self, websocket: WebSocket):
        self.active_connections.remove(websocket)

    async def broadcast(self, message: dict):
        for connection in self.active_connections:
            try:
                await connection.send_json(message)
            except:
                pass

    async def monitor_captures(self):
        """监控抓包文件变化（JSONL格式）"""
        while True:
            try:
                if os.path.exists(self.capture_file):
                    current_size = os.path.getsize(self.capture_file)

                    # 如果文件大小变化，说明有新数据
                    if current_size > self.last_position:
                        with open(self.capture_file, 'r', encoding='utf-8') as f:
                            # 移动到上次读取的位置
                            f.seek(self.last_position)

                            # 读取新增的行
                            for line in f:
                                line = line.strip()
                                if line:  # 跳过空行
                                    try:
                                        data = json.loads(line)
                                        await self.broadcast({"type": "new_capture", "data": data})
                                    except json.JSONDecodeError as e:
                                        print(f"解析JSON行失败: {e}, 行内容: {line[:100]}")

                            # 更新位置
                            self.last_position = f.tell()
                    elif current_size < self.last_position:
                        # 文件被清空或重建，重置位置
                        self.last_position = 0
            except Exception as e:
                print(f"监控抓包文件错误: {e}")
                import traceback
                traceback.print_exc()
            await asyncio.sleep(0.3)  # 每0.3秒检查一次

manager = ConnectionManager()

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

@app.websocket("/ws/captures")
async def websocket_endpoint(websocket: WebSocket):
    """WebSocket端点，用于实时推送抓包数据"""
    await manager.connect(websocket)
    try:
        while True:
            # 保持连接活跃
            await websocket.receive_text()
    except WebSocketDisconnect:
        manager.disconnect(websocket)

@app.on_event("startup")
async def startup_event():
    """应用启动时启动监控任务"""
    asyncio.create_task(manager.monitor_captures())

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000, reload=True)