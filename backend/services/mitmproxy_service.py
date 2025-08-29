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
        self.pid_file = "./data/mitmdump.pid"

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
        # 方法1: 检查subprocess对象
        if self.process and self.process.poll() is None:
            return True

        # 方法2: 通过端口检查
        return self._check_port_in_use()
    
    def _reconnect_to_process(self, pid: int):
        """重新建立到现有进程的连接"""
        try:
            # 注意：这里不能直接从PID创建Popen对象
            # 但可以用于后续的停止操作
            self.process = None  # 暂时设为None，通过PID文件管理
        except Exception:
            pass
    
    def _check_port_in_use(self) -> bool:
        """检查端口是否被占用"""
        try:
            with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
                result = s.connect_ex(('127.0.0.1', self.port))
                return result == 0
        except Exception:
            return False

    def get_status(self) -> ProxyStatus:
        """获取代理状态"""
        running = self.is_running()
        
        # 获取PID
        pid = None
        if running:
            if self.process:
                pid = self.process.pid
            elif os.path.exists(self.pid_file):
                try:
                    with open(self.pid_file, 'r') as f:
                        pid = int(f.read().strip())
                except (ValueError, FileNotFoundError):
                    pass
        
        return ProxyStatus(
            running=running,
            ip=self.get_local_ip() if running else None,
            port=self.port,
            pid=pid
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
                "--set", "confdir=./data",
                "--set", "flow_detail=4",
                "--set", "console_default_contentview=raw",
                "--set", "console_eventlog_verbosity=info",
                "--set", "dumper_default_contentview=raw"
            ]

            # 设置环境变量解决中文编码问题
            env = os.environ.copy()
            env['PYTHONIOENCODING'] = 'utf-8'
            env['PYTHONUNBUFFERED'] = '1'
            
            # 根据系统设置合适的locale
            import platform
            if platform.system() == 'Darwin':  # macOS
                env['LC_ALL'] = 'en_US.UTF-8'
                env['LANG'] = 'en_US.UTF-8'
            else:  # Linux
                env['LC_ALL'] = 'C.UTF-8'
                env['LANG'] = 'C.UTF-8'

            # 启动进程，输出到日志文件
            log_file = open("./data/mitmdump.log", "a", encoding="utf-8")
            self.process = subprocess.Popen(
                cmd,
                stdout=log_file,
                stderr=subprocess.STDOUT,
                env=env,
                preexec_fn=os.setsid if os.name != 'nt' else None
            )

            # 保存PID到文件
            with open(self.pid_file, 'w') as f:
                f.write(str(self.process.pid))

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

        pid = None
        
        # 尝试从PID文件获取进程ID
        if os.path.exists(self.pid_file):
            try:
                with open(self.pid_file, 'r') as f:
                    pid = int(f.read().strip())
            except (ValueError, FileNotFoundError):
                pid = None

        # 如果没有PID文件但有process对象，使用process.pid
        if not pid and self.process:
            pid = self.process.pid

        if pid:
            try:
                # 使用psutil停止进程
                proc = psutil.Process(pid)
                if proc.is_running():
                    proc.terminate()
                    # 等待进程结束
                    proc.wait(timeout=10)
                
                # 清理资源
                self.process = None
                return True
                
            except psutil.TimeoutExpired:
                # 超时后强制杀死
                try:
                    proc.kill()
                    proc.wait(timeout=5)
                except:
                    pass
            except psutil.NoSuchProcess:
                # 进程已经不存在
                pass
            except Exception as e:
                print(f"停止mitmproxy失败: {e}")

        # 清理资源
        self.process = None
        return True