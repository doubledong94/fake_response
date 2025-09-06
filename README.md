# MitmProxy Manager - HTTP请求拦截与管理工具

一个基于FastAPI和mitmproxy的HTTP请求拦截与管理工具，支持API Mock、文件下载拦截和请求映射转发功能。

## 功能特性

### 🚀 核心功能
- **代理服务控制**: 一键启动/停止mitmproxy代理服务
- **API Mock管理**: 拦截HTTP请求并返回自定义响应
- **文件下载拦截**: 拦截文件下载请求并返回本地文件
- **请求映射转发**: 将匹配的请求转发到本地端口服务

### 🛠️ 管理功能
- **批量操作**: 支持批量启用/禁用配置
- **数据导入导出**: 支持配置的备份和恢复
- **实时搜索**: 支持按名称、URL、方法等条件过滤
- **热更新**: 配置修改后自动生效，无需重启

### 💻 用户界面
- **现代化Web界面**: 基于Bootstrap 5的响应式设计
- **标签页管理**: 分类管理不同类型的配置
- **实时状态显示**: 代理服务状态实时监控
- **友好的操作体验**: 直观的添加、编辑、删除操作

## 安装与启动

### 1. 创建虚拟环境
```bash
python3.12 -m venv venv
source venv/bin/activate  # Windows: venv\Scripts\activate
```

### 2. 安装依赖
```bash
pip install -r backend/requirements.txt
```

### 3. 启动应用
```bash
./start_server.sh
```

### 4. 访问应用
打开浏览器访问 http://localhost:8000

## 使用指南

### API Mock管理
1. 在"API配置管理"标签页中点击"添加API"
2. 配置API名称、HTTP方法、URL路径
3. 设置响应状态码、响应头和响应体
4. 启用配置后，匹配的请求将返回Mock响应

### 文件下载拦截
1. 在"文件下载拦截"标签页中点击"添加拦截规则"
2. 配置规则名称和URL匹配模式（支持正则表达式）
3. 指定本地文件路径和内容类型
4. 启用后，匹配的下载请求将返回本地文件

### 请求映射转发
1. 在"请求映射管理"标签页中点击"添加映射规则"
2. 配置规则名称和URL匹配模式（支持正则表达式）
3. 设置目标主机和端口（默认localhost）
4. 选择支持的HTTP方法
5. 启用后，匹配的请求将转发到指定的本地服务

### 代理配置
配置浏览器或应用程序使用以下代理设置：
- **代理地址**: localhost
- **代理端口**: 8080
- **代理类型**: HTTP

## 配置示例

### API Mock示例
```json
{
  "name": "用户信息API",
  "method": "GET",
  "url": "/api/user/info",
  "response": {
    "status": 200,
    "headers": {"Content-Type": "application/json"},
    "body": {"userId": 123, "username": "testuser"}
  }
}
```

### 文件下载拦截示例
```json
{
  "name": "PDF文件拦截",
  "url_pattern": ".*\\.pdf$",
  "local_file_path": "/path/to/local/file.pdf",
  "content_type": "application/pdf"
}
```

### 请求映射示例
```json
{
  "name": "本地API服务",
  "url_pattern": "api\\.example\\.com/.*",
  "target_host": "localhost",
  "target_port": 3000,
  "methods": ["GET", "POST"]
}
```

## 技术架构

### 后端技术
- **FastAPI**: 现代高性能Web框架
- **mitmproxy**: HTTP/HTTPS代理库
- **Pydantic**: 数据验证和序列化
- **requests**: HTTP客户端库

### 前端技术
- **Bootstrap 5**: 响应式CSS框架
- **Bootstrap Icons**: 图标库
- **原生JavaScript**: 无依赖的前端逻辑

### 文件结构
```
├── backend/
│   ├── main.py              # FastAPI应用入口
│   ├── models.py            # 数据模型定义
│   ├── api/
│   │   └── routes.py        # API路由定义
│   └── services/
│       ├── config_service.py      # 配置管理服务
│       └── mitmproxy_service.py   # 代理服务管理
├── frontend/
│   ├── index.html           # 主页面
│   └── static/
│       └── js/app.js        # 前端逻辑
├── scripts/
│   └── mitmproxy_addon.py   # mitmproxy插件
└── data/
    └── config.json          # 配置数据存储
```

## 注意事项

1. **HTTPS支持**: 如需拦截HTTPS请求，需要安装mitmproxy的根证书
2. **端口冲突**: 确保8000（Web界面）和8080（代理服务）端口未被占用
3. **文件权限**: 确保应用有权限读取本地文件和写入配置文件
4. **目标服务**: 请求映射的目标服务必须在指定端口上运行

## 故障排除

### 代理启动失败
- 检查端口8080是否被占用
- 确认mitmproxy已正确安装
- 查看`data/mitmdump.log`日志文件

### 请求映射不生效
- 确认URL模式正则表达式正确
- 检查目标服务是否在指定端口运行
- 确认HTTP方法匹配
- 重启代理服务使配置生效

### 文件下载失败
- 确认本地文件路径正确且文件存在
- 检查文件读取权限
- 验证URL模式匹配规则

## 开发说明

这个工具提供了完整的HTTP请求拦截和管理解决方案，代码结构清晰，易于维护和扩展。支持多种拦截模式，满足开发、测试和调试等多种场景需求。