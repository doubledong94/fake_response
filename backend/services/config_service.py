import json
import os
import shutil
from typing import List, Optional
from datetime import datetime
from models import APIConfig, APIConfigList, FileDownloadConfig


class ConfigService:
    def __init__(self, config_file: str = "data/config.json"):
        self.config_file = config_file
        self.ensure_data_dir()

    def ensure_data_dir(self):
        """确保数据目录存在"""
        os.makedirs(os.path.dirname(self.config_file), exist_ok=True)

    def load_config(self) -> dict:
        """加载配置文件"""
        try:
            if os.path.exists(self.config_file):
                with open(self.config_file, 'r', encoding='utf-8') as f:
                    data = json.load(f)
                    if "file_downloads" not in data:
                        data["file_downloads"] = []
                    return data
            else:
                return {"apis": [], "file_downloads": []}
        except Exception as e:
            print(f"加载配置文件失败: {e}")
            return {"apis": [], "file_downloads": []}

    def save_config(self, config: dict) -> bool:
        """保存配置文件"""
        try:
            # 创建备份
            self.create_backup()

            with open(self.config_file, 'w', encoding='utf-8') as f:
                json.dump(config, f, ensure_ascii=False, indent=2)
            return True
        except Exception as e:
            print(f"保存配置文件失败: {e}")
            return False

    def create_backup(self) -> bool:
        """创建配置文件备份"""
        try:
            if os.path.exists(self.config_file):
                backup_name = f"{self.config_file}.backup.{datetime.now().strftime('%Y%m%d_%H%M%S')}"
                shutil.copy2(self.config_file, backup_name)

                # 只保留最近5个备份文件
                self.cleanup_backups()
            return True
        except Exception as e:
            print(f"创建备份失败: {e}")
            return False

    def cleanup_backups(self):
        """清理旧的备份文件"""
        try:
            backup_dir = os.path.dirname(self.config_file)
            backup_files = [f for f in os.listdir(backup_dir) if f.startswith(os.path.basename(self.config_file) + ".backup.")]
            backup_files.sort(reverse=True)

            # 删除超过5个的备份文件
            for backup_file in backup_files[5:]:
                os.remove(os.path.join(backup_dir, backup_file))
        except Exception as e:
            print(f"清理备份文件失败: {e}")

    def get_all_apis(self) -> List[APIConfig]:
        """获取所有API配置"""
        config = self.load_config()
        return [APIConfig(**api) for api in config.get("apis", [])]

    def get_api_by_id(self, api_id: str) -> Optional[APIConfig]:
        """根据ID获取API配置"""
        apis = self.get_all_apis()
        for api in apis:
            if api.id == api_id:
                return api
        return None

    def add_api(self, api: APIConfig) -> bool:
        """添加API配置"""
        config = self.load_config()
        config["apis"].append(api.dict())
        return self.save_config(config)

    def update_api(self, api_id: str, updated_api: APIConfig) -> bool:
        """更新API配置"""
        config = self.load_config()
        for i, api in enumerate(config["apis"]):
            if api["id"] == api_id:
                config["apis"][i] = updated_api.dict()
                return self.save_config(config)
        return False

    def delete_api(self, api_id: str) -> bool:
        """删除API配置"""
        config = self.load_config()
        config["apis"] = [api for api in config["apis"] if api["id"] != api_id]
        return self.save_config(config)

    def toggle_api_status(self, api_id: str) -> bool:
        """切换API启用状态"""
        config = self.load_config()
        for api in config["apis"]:
            if api["id"] == api_id:
                api["enabled"] = not api["enabled"]
                return self.save_config(config)
        return False

    def batch_toggle_apis(self, api_ids: List[str], enabled: bool) -> bool:
        """批量切换API状态"""
        config = self.load_config()
        updated = False
        for api in config["apis"]:
            if api["id"] in api_ids:
                api["enabled"] = enabled
                updated = True

        if updated:
            return self.save_config(config)
        return False

    def export_config(self, export_path: str) -> bool:
        """导出配置到指定路径"""
        try:
            config = self.load_config()
            with open(export_path, 'w', encoding='utf-8') as f:
                json.dump(config, f, ensure_ascii=False, indent=2)
            return True
        except Exception as e:
            print(f"导出配置失败: {e}")
            return False

    def import_config(self, import_path: str) -> bool:
        """从指定路径导入配置"""
        try:
            with open(import_path, 'r', encoding='utf-8') as f:
                data = json.load(f)
                if "file_downloads" not in data:
                    data["file_downloads"] = []
                return self.save_config(data)
        except Exception as e:
            print(f"导入配置失败: {e}")
            return False

    # File download related methods
    def get_all_file_downloads(self) -> List[FileDownloadConfig]:
        """获取所有文件下载配置"""
        config = self.load_config()
        return [FileDownloadConfig(**fd) for fd in config.get("file_downloads", [])]

    def get_file_download_by_id(self, download_id: str) -> Optional[FileDownloadConfig]:
        """根据ID获取文件下载配置"""
        downloads = self.get_all_file_downloads()
        for download in downloads:
            if download.id == download_id:
                return download
        return None

    def add_file_download(self, download: FileDownloadConfig) -> bool:
        """添加文件下载配置"""
        config = self.load_config()
        config["file_downloads"].append(download.dict())
        return self.save_config(config)

    def update_file_download(self, download_id: str, updated_download: FileDownloadConfig) -> bool:
        """更新文件下载配置"""
        config = self.load_config()
        for i, download in enumerate(config["file_downloads"]):
            if download["id"] == download_id:
                config["file_downloads"][i] = updated_download.dict()
                return self.save_config(config)
        return False

    def delete_file_download(self, download_id: str) -> bool:
        """删除文件下载配置"""
        config = self.load_config()
        config["file_downloads"] = [download for download in config["file_downloads"] if download["id"] != download_id]
        return self.save_config(config)

    def toggle_file_download_status(self, download_id: str) -> bool:
        """切换文件下载启用状态"""
        config = self.load_config()
        for download in config["file_downloads"]:
            if download["id"] == download_id:
                download["enabled"] = not download["enabled"]
                return self.save_config(config)
        return False