import subprocess
import psutil
import socket
import os
import signal
import time
from typing import Optional
from models import ProxyStatus


class MitmProxyService:
    def __init__(self):
        self.process: Optional[subprocess.Popen] = None
        self.port = 8080

    def get_local_ip(self) -> str:
        """获取本地IP地址"""
        try:
            # 创建一个socket连接来获取本地IP
            s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
            s.connect(("8.8.8.8", 80))
            ip = s.getsockname()[0]
            s.close()
            return ip
        except Exception:
            return "127.0.0.1"

    def is_running(self) -> bool:
        """检查mitmproxy是否正在运行"""
        if self.process is None:
            return False

        try:
            # 检查进程是否还存在
            return self.process.poll() is None
        except Exception:
            return False

    def get_status(self) -> ProxyStatus:
        """获取代理状态"""
        running = self.is_running()
        return ProxyStatus(
            running=running,
            ip=self.get_local_ip() if running else None,
            port=self.port,
            pid=self.process.pid if running and self.process else None
        )

    def start(self) -> bool:
        """启动mitmproxy"""
        if self.is_running():
            return True

        try:
            # 构建mitmproxy命令
            addon_path = os.path.join(os.path.dirname(__file__), "..", "..", "scripts", "mitmproxy_addon.py")
            cmd = [
                "mitmdump",
                "-p", str(self.port),
                "-s", addon_path,
                "--set", "confdir=./data"
            ]

            # 启动进程
            self.process = subprocess.Popen(
                cmd,
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
                preexec_fn=os.setsid if os.name != 'nt' else None
            )

            # 等待一小段时间确保启动成功
            time.sleep(2)

            if self.is_running():
                return True
            else:
                self.process = None
                return False

        except Exception as e:
            print(f"启动mitmproxy失败: {e}")
            self.process = None
            return False

    def stop(self) -> bool:
        """停止mitmproxy"""
        if not self.is_running():
            return True

        try:
            if self.process:
                if os.name == 'nt':  # Windows
                    self.process.terminate()
                else:  # Unix/Linux
                    os.killpg(os.getpgid(self.process.pid), signal.SIGTERM)

                # 等待进程结束
                self.process.wait(timeout=10)
                self.process = None
                return True
        except Exception as e:
            print(f"停止mitmproxy失败: {e}")
            # 强制杀死进程
            try:
                if self.process:
                    if os.name == 'nt':
                        self.process.kill()
                    else:
                        os.killpg(os.getpgid(self.process.pid), signal.SIGKILL)
                    self.process = None
                return True
            except Exception:
                return False

        return False