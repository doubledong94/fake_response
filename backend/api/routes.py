from fastapi import APIRouter, HTTPException, UploadFile, File
from fastapi.responses import FileResponse
from typing import List
import tempfile
import os
import subprocess
import re

from models import (
    APIConfig, APICreateRequest, APIUpdateRequest,
    ProxyStatus, HTTPMethod, FileDownloadConfig,
    FileDownloadCreateRequest, FileDownloadUpdateRequest,
    RequestMappingConfig, RequestMappingCreateRequest, RequestMappingUpdateRequest,
    CapturedFlow
)
from services.mitmproxy_service import MitmProxyService
from services.config_service import ConfigService
from services.capture_service import get_capture_service

router = APIRouter()
mitmproxy_service = MitmProxyService()
config_service = ConfigService()
capture_service = get_capture_service()


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
async def batch_toggle_apis(request: dict):
    """批量切换API状态"""
    api_ids = request.get("api_ids", [])
    enabled = request.get("enabled", True)
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


# 请求映射管理相关API
@router.get("/request-mappings", response_model=List[RequestMappingConfig])
async def get_all_request_mappings():
    """获取所有请求映射配置"""
    return config_service.get_all_request_mappings()


@router.get("/request-mappings/{mapping_id}", response_model=RequestMappingConfig)
async def get_request_mapping(mapping_id: str):
    """获取指定请求映射配置"""
    mapping = config_service.get_request_mapping_by_id(mapping_id)
    if not mapping:
        raise HTTPException(status_code=404, detail="请求映射配置不存在")
    return mapping


@router.post("/request-mappings", response_model=RequestMappingConfig)
async def create_request_mapping(mapping_request: RequestMappingCreateRequest):
    """创建新的请求映射配置"""
    mapping = RequestMappingConfig(
        name=mapping_request.name,
        url_pattern=mapping_request.url_pattern,
        target_host=mapping_request.target_host,
        target_port=mapping_request.target_port,
        methods=mapping_request.methods
    )

    success = config_service.add_request_mapping(mapping)
    if success:
        return mapping
    else:
        raise HTTPException(status_code=500, detail="创建请求映射配置失败")


@router.put("/request-mappings/{mapping_id}", response_model=RequestMappingConfig)
async def update_request_mapping(mapping_id: str, mapping_request: RequestMappingUpdateRequest):
    """更新请求映射配置"""
    existing_mapping = config_service.get_request_mapping_by_id(mapping_id)
    if not existing_mapping:
        raise HTTPException(status_code=404, detail="请求映射配置不存在")

    # 更新字段
    update_data = mapping_request.dict(exclude_unset=True)
    for field, value in update_data.items():
        setattr(existing_mapping, field, value)

    success = config_service.update_request_mapping(mapping_id, existing_mapping)
    if success:
        return existing_mapping
    else:
        raise HTTPException(status_code=500, detail="更新请求映射配置失败")


@router.delete("/request-mappings/{mapping_id}")
async def delete_request_mapping(mapping_id: str):
    """删除请求映射配置"""
    success = config_service.delete_request_mapping(mapping_id)
    if success:
        return {"message": "请求映射配置删除成功", "success": True}
    else:
        raise HTTPException(status_code=404, detail="请求映射配置不存在")


@router.post("/request-mappings/{mapping_id}/toggle")
async def toggle_request_mapping_status(mapping_id: str):
    """切换请求映射启用状态"""
    success = config_service.toggle_request_mapping_status(mapping_id)
    if success:
        return {"message": "请求映射状态切换成功", "success": True}
    else:
        raise HTTPException(status_code=404, detail="请求映射配置不存在")


# ADB设备管理相关API
@router.get("/adb/devices")
async def get_adb_devices():
    """获取连接的ADB设备列表"""
    try:
        result = subprocess.run(
            ['adb', 'devices'],
            capture_output=True,
            text=True,
            timeout=5
        )

        if result.returncode != 0:
            raise HTTPException(status_code=500, detail="执行adb devices失败")

        # 解析设备列表
        devices = []
        lines = result.stdout.strip().split('\n')[1:]  # 跳过第一行 "List of devices attached"

        for line in lines:
            line = line.strip()
            if line:
                # 使用正则表达式分割，支持制表符或多个空格
                parts = re.split(r'\s+', line, maxsplit=1)
                if len(parts) == 2:
                    device_id, status = parts
                    if status == 'device':  # 只返回正常连接的设备
                        devices.append({
                            'id': device_id,
                            'status': status
                        })

        return {'devices': devices}
    except FileNotFoundError:
        raise HTTPException(status_code=500, detail="ADB命令未找到，请确保已安装Android SDK")
    except subprocess.TimeoutExpired:
        raise HTTPException(status_code=500, detail="ADB命令执行超时")
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"获取设备列表失败: {str(e)}")


@router.get("/adb/devices/{device_id}/proxy")
async def get_device_proxy(device_id: str):
    """获取指定设备的代理设置"""
    try:
        result = subprocess.run(
            ['adb', '-s', device_id, 'shell', 'settings', 'get', 'global', 'http_proxy'],
            capture_output=True,
            text=True,
            timeout=5
        )

        if result.returncode != 0:
            raise HTTPException(status_code=500, detail="获取代理设置失败")

        proxy = result.stdout.strip()

        return {
            'device_id': device_id,
            'proxy': proxy if proxy and proxy != 'null' else None
        }
    except FileNotFoundError:
        raise HTTPException(status_code=500, detail="ADB命令未找到")
    except subprocess.TimeoutExpired:
        raise HTTPException(status_code=500, detail="ADB命令执行超时")
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"获取代理设置失败: {str(e)}")


@router.post("/adb/devices/{device_id}/proxy")
async def set_device_proxy(device_id: str, request: dict):
    """设置指定设备的代理"""
    try:
        proxy = request.get('proxy')

        if proxy:
            # 设置代理
            result = subprocess.run(
                ['adb', '-s', device_id, 'shell', 'settings', 'put', 'global', 'http_proxy', proxy],
                capture_output=True,
                text=True,
                timeout=5
            )
        else:
            # 清除代理
            result = subprocess.run(
                ['adb', '-s', device_id, 'shell', 'settings', 'put', 'global', 'http_proxy', ':0'],
                capture_output=True,
                text=True,
                timeout=5
            )

        if result.returncode != 0:
            raise HTTPException(status_code=500, detail="设置代理失败")

        return {
            'message': '代理设置成功',
            'success': True,
            'device_id': device_id,
            'proxy': proxy
        }
    except FileNotFoundError:
        raise HTTPException(status_code=500, detail="ADB命令未找到")
    except subprocess.TimeoutExpired:
        raise HTTPException(status_code=500, detail="ADB命令执行超时")
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"设置代理失败: {str(e)}")


# 抓包数据管理相关API
@router.get("/captures", response_model=List[CapturedFlow])
async def get_captures(limit: int = 100, offset: int = 0):
    """获取抓包数据列表"""
    return capture_service.get_all_flows(limit=limit, offset=offset)


@router.get("/captures/search")
async def search_captures(q: str, limit: int = 100):
    """搜索抓包数据"""
    return capture_service.search_flows(q, limit=limit)


@router.get("/captures/{flow_id}", response_model=CapturedFlow)
async def get_capture(flow_id: str):
    """获取指定抓包数据详情"""
    flow = capture_service.get_flow_by_id(flow_id)
    if not flow:
        raise HTTPException(status_code=404, detail="抓包数据不存在")
    return flow


@router.delete("/captures")
async def clear_captures():
    """清空所有抓包数据"""
    capture_service.clear_flows()
    return {"message": "抓包数据已清空", "success": True}


@router.get("/captures/statistics")
async def get_capture_statistics():
    """获取抓包统计信息"""
    return capture_service.get_statistics()