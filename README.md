# 1. 安装依赖

## 创建虚拟环境
python3.12 -m venv venv

source venv/bin/activate  # Windows: venv\Scripts\activate

## 安装依赖
pip install -r backend/requirements.txt

## 安装mitmproxy
pip install mitmproxy


# 2. 启动应用

## 启动后端服务

./start_server.sh

# 3. 访问应用
打开浏览器访问 http://localhost:8000

# 4. 功能说明
代理控制：点击启动/停止按钮控制mitmproxy服务

API管理：添加、编辑、删除API配置

响应配置：为每个API配置mock响应数据

批量操作：支持批量启用/禁用API

数据导入导出：支持配置的备份和恢复

实时搜索：支持按名称、URL、方法等条件过滤

这个完整的Web应用程序提供了友好的用户界面来管理mitmproxy代理服务，支持所有你要求的功能。代码结构清晰，易于维护和扩展。