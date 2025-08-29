import json
import os
import sys
from mitmproxy import http
from typing import Dict, Any
from urllib.parse import urlparse

# 确保标准输出使用UTF-8编码
if hasattr(sys.stdout, 'reconfigure'):
    sys.stdout.reconfigure(encoding='utf-8')
elif hasattr(sys.stdout, 'buffer'):
    sys.stdout = open(sys.stdout.fileno(), 'w', encoding='utf-8', buffering=1)


class MockAddon:
    def __init__(self):
        self.config_file = "data/config.json"
        self.apis = {}
        self.load_config()

    def load_config(self):
        """加载API配置"""
        try:
            if os.path.exists(self.config_file):
                with open(self.config_file, 'r', encoding='utf-8') as f:
                    data = json.load(f)
                    self.apis = {}
                    for api in data.get('apis', []):
                        if api.get('enabled', True):
                            parsed_url = urlparse(api['url'])
                            key = f"{api['method']}:{parsed_url.netloc}{parsed_url.path}"
                            self.apis[key] = api['response']
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

    def request(self, flow: http.HTTPFlow) -> None:
        """处理HTTP请求"""
        # 重新加载配置以支持热更新
        self.load_config()

        method = flow.request.method
        parsed_url = urlparse(flow.request.url)
        netloc = parsed_url.netloc
        path = parsed_url.path

        # 查找匹配的API配置
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


addons = [MockAddon()]