import json
import os
from mitmproxy import http
from typing import Dict, Any


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
                            key = f"{api['method']}:{api['url']}"
                            self.apis[key] = api['response']
        except Exception as e:
            print(f"加载配置失败: {e}")

    def request(self, flow: http.HTTPFlow) -> None:
        """处理HTTP请求"""
        # 重新加载配置以支持热更新
        self.load_config()

        method = flow.request.method
        path = flow.request.path

        # 查找匹配的API配置
        key = f"{method}:{path}"
        if key in self.apis:
            response_config = self.apis[key]

            # 创建响应
            flow.response = http.Response.make(
                status_code=response_config.get('status', 200),
                content=json.dumps(response_config.get('body', {}), ensure_ascii=False),
                headers=response_config.get('headers', {"Content-Type": "application/json"})
            )

            print(f"Mock响应: {method} {path} -> {response_config.get('status', 200)}")


addons = [MockAddon()]