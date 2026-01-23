import json
import os
import sys
import mimetypes
import re
import requests
import time
from mitmproxy import http
from typing import Dict, Any
from urllib.parse import urlparse, parse_qs

# 确保标准输出使用UTF-8编码
if hasattr(sys.stdout, 'reconfigure'):
    sys.stdout.reconfigure(encoding='utf-8')
elif hasattr(sys.stdout, 'buffer'):
    sys.stdout = open(sys.stdout.fileno(), 'w', encoding='utf-8', buffering=1)


class MockAddon:
    def __init__(self):
        self.config_file = "data/config.json"
        self.capture_file = "data/realtime_capture.json"
        self.apis = {}
        self.file_downloads = {}
        self.request_mappings = []
        self.flow_start_times = {}  # 记录请求开始时间
        self.request_count = 0  # 统计请求数量
        self.response_count = 0  # 统计响应数量
        self.load_config()

    def load_config(self):
        """加载API配置、文件下载配置和请求映射配置"""
        try:
            if os.path.exists(self.config_file):
                with open(self.config_file, 'r', encoding='utf-8') as f:
                    data = json.load(f)
                    
                    # 加载API配置
                    self.apis = {}
                    for api in data.get('apis', []):
                        if api.get('enabled', True):
                            parsed_url = urlparse(api['url'])
                            key = f"{api['method']}:{parsed_url.netloc}{parsed_url.path}"
                            self.apis[key] = api['response']
                    
                    # 加载文件下载配置
                    self.file_downloads = {}
                    for download in data.get('file_downloads', []):
                        if download.get('enabled', True):
                            self.file_downloads[download['url_pattern']] = download
                    
                    # 加载请求映射配置
                    self.request_mappings = []
                    for mapping in data.get('request_mappings', []):
                        if mapping.get('enabled', True):
                            self.request_mappings.append(mapping)
        except Exception as e:
            print(f"加载配置失败: {e}")

    def safe_json_encode(self, data):
        """安全的JSON编码，处理特殊字符"""
        try:
            # 使用ensure_ascii=False来保持Unicode字符，但添加错误处理
            json_str = json.dumps(data, ensure_ascii=False, separators=(',', ':'))
            # 确保字符串可以被UTF-8编码
            json_str.encode('utf-8')
            return json_str
        except (UnicodeEncodeError, UnicodeDecodeError):
            # 如果出现编码错误，使用ensure_ascii=True作为备选方案
            return json.dumps(data, ensure_ascii=True, separators=(',', ':'))

    def match_url_pattern(self, url: str, pattern: str) -> bool:
        """检查URL是否匹配模式"""
        try:
            # 支持正则表达式匹配
            return bool(re.search(pattern, url))
        except re.error:
            # 如果正则表达式无效，使用简单的字符串匹配
            return pattern in url

    def get_content_type(self, file_path: str, configured_type: str = None) -> str:
        """获取文件的内容类型"""
        if configured_type:
            return configured_type
        
        content_type, _ = mimetypes.guess_type(file_path)
        return content_type or 'application/octet-stream'

    def serve_local_file(self, flow: http.HTTPFlow, download_config: dict) -> bool:
        """提供本地文件服务"""
        try:
            file_path = download_config['local_file_path']
            
            # 检查文件是否存在
            if not os.path.exists(file_path):
                print(f"本地文件不存在: {file_path}")
                return False
            
            # 获取文件大小
            file_size = os.path.getsize(file_path)
            
            # 确定内容类型
            content_type = self.get_content_type(file_path, download_config.get('content_type'))
            
            # 构建响应头
            filename = os.path.basename(file_path)
            headers = {
                "Content-Type": content_type,
                "Content-Length": str(file_size),
                "Accept-Ranges": "bytes",
                "Last-Modified": "Mon, 02 Sep 2024 08:00:00 GMT",
                "ETag": f'"{file_size}-{filename}"',
                "Server": "mitmproxy-file-server"
            }
            
            # 检查是否是范围请求
            range_header = flow.request.headers.get("Range", "")
            if range_header and range_header.startswith("bytes="):
                # 处理范围请求
                try:
                    ranges = range_header[6:].split("-")
                    start = int(ranges[0]) if ranges[0] else 0
                    end = int(ranges[1]) if ranges[1] else file_size - 1
                    
                    # 确保范围有效
                    start = max(0, min(start, file_size - 1))
                    end = max(start, min(end, file_size - 1))
                    
                    # 读取指定范围的文件内容
                    with open(file_path, 'rb') as f:
                        f.seek(start)
                        file_content = f.read(end - start + 1)
                    
                    headers.update({
                        "Content-Range": f"bytes {start}-{end}/{file_size}",
                        "Content-Length": str(len(file_content))
                    })
                    
                    flow.response = http.Response.make(
                        status_code=206,  # Partial Content
                        content=file_content,
                        headers=headers
                    )
                    
                    print(f"文件范围请求拦截: {flow.request.url} -> {file_path} (bytes {start}-{end}/{file_size})")
                    return True
                    
                except (ValueError, IndexError):
                    # 范围请求格式错误，返回完整文件
                    pass
            
            # 读取完整文件内容
            with open(file_path, 'rb') as f:
                file_content = f.read()
            
            # 创建响应
            flow.response = http.Response.make(
                status_code=200,
                content=file_content,
                headers=headers
            )
            
            print(f"文件下载拦截: {flow.request.url} -> {file_path} ({file_size} bytes)")
            return True
            
        except Exception as e:
            print(f"提供本地文件服务时出错: {e}")
            return False

    def handle_request_mapping(self, flow: http.HTTPFlow, mapping_config: dict) -> bool:
        """处理请求映射转发"""
        try:
            target_host = mapping_config.get('target_host', 'localhost')
            target_port = mapping_config.get('target_port')
            
            if not target_port:
                print(f"请求映射配置错误: 缺少target_port")
                return False
            
            # 构建目标URL
            original_url = flow.request.url
            parsed_url = urlparse(original_url)
            
            # 替换主机和端口
            target_url = f"http://{target_host}:{target_port}{parsed_url.path}"
            if parsed_url.query:
                target_url += f"?{parsed_url.query}"
            
            # 准备请求数据
            headers = dict(flow.request.headers)
            # 移除可能冲突的头部
            headers.pop('Host', None)
            headers['Host'] = f"{target_host}:{target_port}"
            
            method = flow.request.method.upper()
            
            # 发送请求到目标服务器
            response = None
            if method == 'GET':
                response = requests.get(target_url, headers=headers, timeout=30)
            elif method == 'POST':
                response = requests.post(
                    target_url, 
                    data=flow.request.content, 
                    headers=headers,
                    timeout=30
                )
            elif method == 'PUT':
                response = requests.put(
                    target_url, 
                    data=flow.request.content, 
                    headers=headers,
                    timeout=30
                )
            elif method == 'DELETE':
                response = requests.delete(target_url, headers=headers, timeout=30)
            elif method == 'PATCH':
                response = requests.patch(
                    target_url, 
                    data=flow.request.content, 
                    headers=headers,
                    timeout=30
                )
            else:
                # 对于其他方法，使用requests的通用方法
                response = requests.request(
                    method,
                    target_url,
                    data=flow.request.content,
                    headers=headers,
                    timeout=30
                )
            
            if response:
                # 准备响应头
                response_headers = dict(response.headers)
                # 移除可能导致问题的头部
                response_headers.pop('Transfer-Encoding', None)
                response_headers.pop('Connection', None)
                
                # 创建响应
                flow.response = http.Response.make(
                    status_code=response.status_code,
                    content=response.content,
                    headers=response_headers
                )
                
                print(f"请求映射转发: {original_url} -> {target_url} (状态码: {response.status_code})")
                return True
            
        except requests.exceptions.ConnectionError:
            print(f"请求映射转发失败: 无法连接到 {target_host}:{target_port}")
            # 创建连接错误响应
            flow.response = http.Response.make(
                status_code=502,
                content=b'{"error": "Target server unavailable"}',
                headers={"Content-Type": "application/json; charset=utf-8"}
            )
            return True
        except requests.exceptions.Timeout:
            print(f"请求映射转发超时: {target_host}:{target_port}")
            # 创建超时响应
            flow.response = http.Response.make(
                status_code=504,
                content=b'{"error": "Target server timeout"}',
                headers={"Content-Type": "application/json; charset=utf-8"}
            )
            return True
        except Exception as e:
            print(f"请求映射转发时出错: {e}")
            return False
        
        return False

    def save_captured_flow(self, flow: http.HTTPFlow):
        """保存抓包数据到文件（JSONL格式，每行一个JSON对象）"""
        try:
            # 记录请求开始时间
            flow_id = id(flow)
            start_time = self.flow_start_times.get(flow_id, time.time())

            parsed_url = urlparse(flow.request.url)

            # 准备请求数据
            request_headers = dict(flow.request.headers)
            request_body = ""
            if flow.request.content:
                try:
                    request_body = flow.request.content.decode('utf-8', errors='replace')
                except:
                    request_body = f"<binary data, {len(flow.request.content)} bytes>"

            captured_data = {
                'id': str(flow_id),
                'timestamp': time.time(),
                'request': {
                    'id': str(flow_id),
                    'timestamp': start_time,
                    'method': flow.request.method,
                    'url': flow.request.url,
                    'host': parsed_url.netloc,
                    'path': parsed_url.path,
                    'headers': request_headers,
                    'query_params': parsed_url.query or "",
                    'request_body': request_body,
                    'request_size': len(flow.request.content) if flow.request.content else 0
                }
            }

            # 如果有响应，添加响应数据
            if flow.response:
                response_headers = dict(flow.response.headers)
                response_body = ""
                if flow.response.content:
                    try:
                        response_body = flow.response.content.decode('utf-8', errors='replace')
                    except:
                        response_body = f"<binary data, {len(flow.response.content)} bytes>"

                duration = (time.time() - start_time) * 1000  # 转换为毫秒

                captured_data['response'] = {
                    'status_code': flow.response.status_code,
                    'headers': response_headers,
                    'response_body': response_body,
                    'response_size': len(flow.response.content) if flow.response.content else 0,
                    'duration': round(duration, 2)
                }

            # 写入文件（追加模式，JSONL格式）
            os.makedirs(os.path.dirname(self.capture_file), exist_ok=True)
            with open(self.capture_file, 'a', encoding='utf-8') as f:
                json.dump(captured_data, f, ensure_ascii=False)
                f.write('\n')  # 每个JSON对象一行
                f.flush()  # 立即刷新到磁盘

            # 清理开始时间记录
            if flow_id in self.flow_start_times:
                del self.flow_start_times[flow_id]

        except Exception as e:
            print(f"保存抓包数据失败: {e}")
            import traceback
            traceback.print_exc()

    def request(self, flow: http.HTTPFlow) -> None:
        """处理HTTP请求"""
        # 记录请求开始时间
        self.flow_start_times[id(flow)] = time.time()

        # 统计请求数量
        self.request_count += 1
        if self.request_count % 10 == 0:
            print(f"已处理请求数: {self.request_count}, 已记录响应数: {self.response_count}")

        # 重新加载配置以支持热更新
        self.load_config()

        request_url = flow.request.url
        method = flow.request.method
        parsed_url = urlparse(request_url)
        netloc = parsed_url.netloc
        path = parsed_url.path

        # 首先检查请求映射（优先级最高）
        for mapping_config in self.request_mappings:
            url_pattern = mapping_config.get('url_pattern', '')
            methods = mapping_config.get('methods', [])
            
            # 检查URL模式和HTTP方法是否匹配
            if (self.match_url_pattern(request_url, url_pattern) and 
                method.upper() in [m.upper() for m in methods]):
                if self.handle_request_mapping(flow, mapping_config):
                    return  # 成功转发请求
                # 如果转发失败，继续处理其他配置

        # 然后检查文件下载拦截
        for pattern, download_config in self.file_downloads.items():
            if self.match_url_pattern(request_url, pattern):
                if self.serve_local_file(flow, download_config):
                    return  # 成功拦截并提供了本地文件
                # 如果文件不存在或其他错误，继续处理其他配置

        # 最后查找匹配的API配置
        key = f"{method}:{netloc}{path}"
        if key in self.apis:
            response_config = self.apis[key]

            # 安全地处理响应内容
            try:
                # 获取响应体
                response_body = response_config.get('body', {})

                # 安全编码JSON内容
                content = self.safe_json_encode(response_body)

                # 确保内容是字节类型
                if isinstance(content, str):
                    content = content.encode('utf-8', errors='replace')

                # 创建响应
                flow.response = http.Response.make(
                    status_code=response_config.get('status', 200),
                    content=content,
                    headers=response_config.get('headers', {"Content-Type": "application/json; charset=utf-8"})
                )

                # 安全地输出日志信息
                try:
                    log_msg = f"Mock响应: {method} {netloc}{path} -> {response_config.get('status', 200)}"
                    log_msg.encode('utf-8', errors='replace')
                    print(log_msg)
                    
                    # 输出响应内容（如果包含中文）
                    if isinstance(content, bytes):
                        try:
                            content_str = content.decode('utf-8', errors='replace')
                            if len(content_str) < 1000:  # 只显示较短的响应内容
                                print(f"响应内容: {content_str}")
                        except:
                            pass
                    
                except UnicodeEncodeError:
                    # 如果仍有编码问题，使用ASCII安全版本
                    print(f"Mock Response: {method} {netloc}{path} -> {response_config.get('status', 200)}")

            except Exception as e:
                print(f"创建Mock响应时出错: {e}")
                # 创建一个简单的错误响应
                flow.response = http.Response.make(
                    status_code=500,
                    content=b'{"error": "Mock response encoding error"}',
                    headers={"Content-Type": "application/json; charset=utf-8"}
                )

    def response(self, flow: http.HTTPFlow) -> None:
        """处理HTTP响应，记录抓包数据"""
        try:
            # 统计响应数量
            self.response_count += 1

            # 保存完整的请求和响应数据
            self.save_captured_flow(flow)
        except Exception as e:
            print(f"记录响应时出错: {e}")
            import traceback
            traceback.print_exc()


addons = [MockAddon()]