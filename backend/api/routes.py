from fastapi import APIRouter, HTTPException, UploadFile, File
from fastapi.responses import FileResponse
from typing import List
import tempfile
import os

from models import (
    APIConfig, APICreateRequest, APIUpdateRequest,
    ProxyStatus, HTTPMethod, FileDownloadConfig, 
    FileDownloadCreateRequest, FileDownloadUpdateRequest
)
from services.mitmproxy_service import MitmProxyService
from services.config_service import ConfigService

router = APIRouter()
mitmproxy_service = MitmProxyService()
config_service = ConfigService()


# MitmProxy 控制相关API
@router.get("/proxy/status", response_model=ProxyStatus)
async def get_proxy_status():
    """获取代理状态"""
    return mitmproxy_service.get_status()


@router.post("/proxy/start")
async def start_proxy():
    """启动代理"""
    success = mitmproxy_service.start()
    if success:
        return {"message": "代理启动成功", "success": True}
    else:
        raise HTTPException(status_code=500, detail="代理启动失败")


@router.post("/proxy/stop")
async def stop_proxy():
    """停止代理"""
    success = mitmproxy_service.stop()
    if success:
        return {"message": "代理停止成功", "success": True}
    else:
        raise HTTPException(status_code=500, detail="代理停止失败")


# API配置管理相关API
@router.get("/apis", response_model=List[APIConfig])
async def get_all_apis():
    """获取所有API配置"""
    return config_service.get_all_apis()


@router.get("/apis/{api_id}", response_model=APIConfig)
async def get_api(api_id: str):
    """获取指定API配置"""
    api = config_service.get_api_by_id(api_id)
    if not api:
        raise HTTPException(status_code=404, detail="API配置不存在")
    return api


@router.post("/apis", response_model=APIConfig)
async def create_api(api_request: APICreateRequest):
    """创建新的API配置"""
    api = APIConfig(
        name=api_request.name,
        url=api_request.url,
        method=api_request.method,
        response=api_request.response or ResponseData()
    )

    success = config_service.add_api(api)
    if success:
        return api
    else:
        raise HTTPException(status_code=500, detail="创建API配置失败")


@router.put("/apis/{api_id}", response_model=APIConfig)
async def update_api(api_id: str, api_request: APIUpdateRequest):
    """更新API配置"""
    existing_api = config_service.get_api_by_id(api_id)
    if not existing_api:
        raise HTTPException(status_code=404, detail="API配置不存在")

    # 更新字段
    update_data = api_request.dict(exclude_unset=True)
    for field, value in update_data.items():
        setattr(existing_api, field, value)

    success = config_service.update_api(api_id, existing_api)
    if success:
        return existing_api
    else:
        raise HTTPException(status_code=500, detail="更新API配置失败")


@router.delete("/apis/{api_id}")
async def delete_api(api_id: str):
    """删除API配置"""
    success = config_service.delete_api(api_id)
    if success:
        return {"message": "API配置删除成功", "success": True}
    else:
        raise HTTPException(status_code=404, detail="API配置不存在")


@router.post("/apis/{api_id}/toggle")
async def toggle_api_status(api_id: str):
    """切换API启用状态"""
    success = config_service.toggle_api_status(api_id)
    if success:
        return {"message": "API状态切换成功", "success": True}
    else:
        raise HTTPException(status_code=404, detail="API配置不存在")


@router.post("/apis/batch-toggle")
async def batch_toggle_apis(api_ids: List[str], enabled: bool):
    """批量切换API状态"""
    success = config_service.batch_toggle_apis(api_ids, enabled)
    if success:
        return {"message": "批量操作成功", "success": True}
    else:
        raise HTTPException(status_code=500, detail="批量操作失败")


# 配置导入导出相关API
@router.get("/config/export")
async def export_config():
    """导出配置文件"""
    temp_file = tempfile.NamedTemporaryFile(delete=False, suffix='.json')
    success = config_service.export_config(temp_file.name)

    if success:
        return FileResponse(
            temp_file.name,
            media_type='application/json',
            filename='mitmproxy_config.json'
        )
    else:
        raise HTTPException(status_code=500, detail="导出配置失败")


@router.post("/config/import")
async def import_config(file: UploadFile = File(...)):
    """导入配置文件"""
    if not file.filename.endswith('.json'):
        raise HTTPException(status_code=400, detail="只支持JSON格式的配置文件")

    temp_file = tempfile.NamedTemporaryFile(delete=False, suffix='.json')
    try:
        content = await file.read()
        temp_file.write(content)
        temp_file.close()

        success = config_service.import_config(temp_file.name)
        if success:
            return {"message": "配置导入成功", "success": True}
        else:
            raise HTTPException(status_code=500, detail="配置导入失败")
    finally:
        os.unlink(temp_file.name)


# 获取HTTP方法列表
@router.get("/methods")
async def get_http_methods():
    """获取支持的HTTP方法列表"""
    return [method.value for method in HTTPMethod]


# 文件下载管理相关API
@router.get("/file-downloads", response_model=List[FileDownloadConfig])
async def get_all_file_downloads():
    """获取所有文件下载配置"""
    return config_service.get_all_file_downloads()


@router.get("/file-downloads/{download_id}", response_model=FileDownloadConfig)
async def get_file_download(download_id: str):
    """获取指定文件下载配置"""
    download = config_service.get_file_download_by_id(download_id)
    if not download:
        raise HTTPException(status_code=404, detail="文件下载配置不存在")
    return download


@router.post("/file-downloads", response_model=FileDownloadConfig)
async def create_file_download(download_request: FileDownloadCreateRequest):
    """创建新的文件下载配置"""
    download = FileDownloadConfig(
        name=download_request.name,
        url_pattern=download_request.url_pattern,
        local_file_path=download_request.local_file_path,
        content_type=download_request.content_type
    )

    success = config_service.add_file_download(download)
    if success:
        return download
    else:
        raise HTTPException(status_code=500, detail="创建文件下载配置失败")


@router.put("/file-downloads/{download_id}", response_model=FileDownloadConfig)
async def update_file_download(download_id: str, download_request: FileDownloadUpdateRequest):
    """更新文件下载配置"""
    existing_download = config_service.get_file_download_by_id(download_id)
    if not existing_download:
        raise HTTPException(status_code=404, detail="文件下载配置不存在")

    # 更新字段
    update_data = download_request.dict(exclude_unset=True)
    for field, value in update_data.items():
        setattr(existing_download, field, value)

    success = config_service.update_file_download(download_id, existing_download)
    if success:
        return existing_download
    else:
        raise HTTPException(status_code=500, detail="更新文件下载配置失败")


@router.delete("/file-downloads/{download_id}")
async def delete_file_download(download_id: str):
    """删除文件下载配置"""
    success = config_service.delete_file_download(download_id)
    if success:
        return {"message": "文件下载配置删除成功", "success": True}
    else:
        raise HTTPException(status_code=404, detail="文件下载配置不存在")


@router.post("/file-downloads/{download_id}/toggle")
async def toggle_file_download_status(download_id: str):
    """切换文件下载启用状态"""
    success = config_service.toggle_file_download_status(download_id)
    if success:
        return {"message": "文件下载状态切换成功", "success": True}
    else:
        raise HTTPException(status_code=404, detail="文件下载配置不存在")