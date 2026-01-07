import json
import os
from typing import List, Optional
from collections import deque
from models import CapturedFlow
import time


class CaptureService:
    """抓包数据管理服务"""

    def __init__(self, max_flows=1000):
        self.flows: deque = deque(maxlen=max_flows)  # 使用deque限制内存使用
        self.capture_file = "./data/captures.jsonl"  # 使用JSONL格式存储
        self.load_captures()

    def load_captures(self):
        """加载历史抓包数据"""
        try:
            if os.path.exists(self.capture_file):
                with open(self.capture_file, 'r', encoding='utf-8') as f:
                    for line in f:
                        if line.strip():
                            data = json.loads(line)
                            self.flows.append(CapturedFlow(**data))
        except Exception as e:
            print(f"加载抓包数据失败: {e}")

    def save_flow(self, flow: CapturedFlow):
        """保存单个抓包数据"""
        try:
            # 追加到文件
            os.makedirs(os.path.dirname(self.capture_file), exist_ok=True)
            with open(self.capture_file, 'a', encoding='utf-8') as f:
                f.write(flow.json() + '\n')
        except Exception as e:
            print(f"保存抓包数据失败: {e}")

    def add_flow(self, flow: CapturedFlow):
        """添加新的抓包数据"""
        self.flows.append(flow)
        self.save_flow(flow)

    def get_all_flows(self, limit: Optional[int] = None, offset: int = 0) -> List[CapturedFlow]:
        """获取所有抓包数据（支持分页）"""
        flows_list = list(self.flows)
        # 按时间倒序排序（最新的在前面）
        flows_list.sort(key=lambda x: x.timestamp, reverse=True)

        if limit:
            return flows_list[offset:offset + limit]
        return flows_list[offset:]

    def search_flows(self, query: str, limit: Optional[int] = None) -> List[CapturedFlow]:
        """搜索抓包数据"""
        query_lower = query.lower()
        result = []

        for flow in self.flows:
            # 搜索URL
            if query_lower in flow.request.url.lower():
                result.append(flow)
                continue

            # 搜索请求体
            if query_lower in flow.request.request_body.lower():
                result.append(flow)
                continue

            # 搜索响应体
            if flow.response and query_lower in flow.response.response_body.lower():
                result.append(flow)
                continue

        # 按时间倒序排序
        result.sort(key=lambda x: x.timestamp, reverse=True)

        if limit:
            return result[:limit]
        return result

    def get_flow_by_id(self, flow_id: str) -> Optional[CapturedFlow]:
        """根据ID获取抓包数据"""
        for flow in self.flows:
            if flow.id == flow_id:
                return flow
        return None

    def clear_flows(self):
        """清空所有抓包数据"""
        self.flows.clear()
        try:
            # 清空持久化文件
            if os.path.exists(self.capture_file):
                os.remove(self.capture_file)

            # 清空实时抓包文件
            realtime_file = "./data/realtime_capture.json"
            if os.path.exists(realtime_file):
                # 清空文件内容（而不是删除文件）
                with open(realtime_file, 'w', encoding='utf-8') as f:
                    f.write('')
        except Exception as e:
            print(f"清空抓包数据失败: {e}")

    def get_statistics(self) -> dict:
        """获取抓包统计信息"""
        total = len(self.flows)
        methods = {}
        status_codes = {}

        for flow in self.flows:
            # 统计请求方法
            method = flow.request.method
            methods[method] = methods.get(method, 0) + 1

            # 统计状态码
            if flow.response:
                status = flow.response.status_code
                status_codes[status] = status_codes.get(status, 0) + 1

        return {
            'total': total,
            'methods': methods,
            'status_codes': status_codes
        }


# 全局单例
_capture_service = None


def get_capture_service() -> CaptureService:
    """获取抓包服务单例"""
    global _capture_service
    if _capture_service is None:
        _capture_service = CaptureService()
    return _capture_service
