// 全局变量
let apis = [];
let downloads = [];
let mappings = [];
let currentEditingId = null;
let currentEditingDownloadId = null;
let currentEditingMappingId = null;
let selectedApiIds = new Set();
let adbDevices = [];
let proxyServerAddress = null;

// 页面加载完成后初始化
document.addEventListener('DOMContentLoaded', function() {
    initializeApp();
});

// 初始化应用
async function initializeApp() {
    await checkProxyStatus();
    await loadAPIs();
    await loadDownloads();
    await loadMappings();
    await loadAdbDevices();

    // 初始化抓包功能（启动WebSocket）
    connectWebSocket();

    // 定期检查代理状态
    setInterval(checkProxyStatus, 5000);

    // 定期检查ADB设备
    setInterval(loadAdbDevices, 1000);

    // 标签页切换事件监听
    document.getElementById('download-tab').addEventListener('shown.bs.tab', function() {
        loadDownloads();
    });

    document.getElementById('mapping-tab').addEventListener('shown.bs.tab', function() {
        loadMappings();
    });

    // 抓包监控标签页切换事件
    document.getElementById('captures-tab').addEventListener('shown.bs.tab', function() {
        // 只在第一次切换时加载历史数据
        if (allCaptures.length === 0) {
            loadCaptures();
        } else {
            // 否则只重新渲染（以更新API配置状态）
            renderCaptureTable();
        }
    });

    // API管理标签页切换时也刷新抓包列表（更新标志状态）
    document.getElementById('api-tab').addEventListener('shown.bs.tab', function() {
        if (allCaptures.length > 0) {
            renderCaptureTable();
        }
    });
}

// 检查代理状态
async function checkProxyStatus() {
    try {
        const response = await fetch('/api/proxy/status');
        const status = await response.json();

        updateStatusUI(status);
    } catch (error) {
        console.error('检查代理状态失败:', error);
        updateStatusUI({ running: false });
    }
}

// 更新状态UI
function updateStatusUI(status) {
    const indicator = document.getElementById('statusIndicator');
    const statusText = document.getElementById('statusText');
    const proxyInfo = document.getElementById('proxyInfo');
    const proxyAddress = document.getElementById('proxyAddress');
    const startBtn = document.getElementById('startBtn');
    const stopBtn = document.getElementById('stopBtn');

    if (status.running) {
        indicator.className = 'status-indicator status-running';
        statusText.textContent = '代理服务运行中';
        proxyAddress.textContent = `${status.ip}:${status.port}`;
        proxyServerAddress = `${status.ip}:${status.port}`;
        proxyInfo.style.display = 'block';
        startBtn.disabled = true;
        stopBtn.disabled = false;
    } else {
        indicator.className = 'status-indicator status-stopped';
        statusText.textContent = '代理服务已停止';
        proxyServerAddress = null;
        proxyInfo.style.display = 'none';
        startBtn.disabled = false;
        stopBtn.disabled = true;
    }
}

// 启动代理
async function startProxy() {
    const startBtn = document.getElementById('startBtn');
    const originalText = startBtn.innerHTML;

    try {
        startBtn.innerHTML = '<span class="spinner-border spinner-border-sm me-2"></span>启动中...';
        startBtn.disabled = true;

        const response = await fetch('/api/proxy/start', { method: 'POST' });
        const result = await response.json();

        if (response.ok) {
            showToast('代理启动成功', 'success');
            await checkProxyStatus();
        } else {
            throw new Error(result.detail || '启动失败');
        }
    } catch (error) {
        console.error('启动代理失败:', error);
        showToast('代理启动失败: ' + error.message, 'error');
        startBtn.disabled = false;
    } finally {
        startBtn.innerHTML = originalText;
    }
}

// 停止代理
async function stopProxy() {
    const stopBtn = document.getElementById('stopBtn');
    const originalText = stopBtn.innerHTML;

    try {
        stopBtn.innerHTML = '<span class="spinner-border spinner-border-sm me-2"></span>停止中...';
        stopBtn.disabled = true;

        const response = await fetch('/api/proxy/stop', { method: 'POST' });
        const result = await response.json();

        if (response.ok) {
            showToast('代理停止成功', 'success');
            await checkProxyStatus();
        } else {
            throw new Error(result.detail || '停止失败');
        }
    } catch (error) {
        console.error('停止代理失败:', error);
        showToast('代理停止失败: ' + error.message, 'error');
        stopBtn.disabled = false;
    } finally {
        stopBtn.innerHTML = originalText;
    }
}

// 加载API列表
async function loadAPIs() {
    try {
        const response = await fetch('/api/apis');
        apis = await response.json();
        renderAPITable();
    } catch (error) {
        console.error('加载API列表失败:', error);
        showToast('加载API列表失败', 'error');
    }
}

// 渲染API表格
function renderAPITable() {
    const tbody = document.getElementById('apiTableBody');
    const emptyState = document.getElementById('emptyState');

    if (apis.length === 0) {
        tbody.innerHTML = '';
        emptyState.style.display = 'block';
        return;
    }

    emptyState.style.display = 'none';

    tbody.innerHTML = apis.map(api => `
        <tr class="api-row ${!api.enabled ? 'disabled' : ''}" data-id="${api.id}">
            <td>
                <input type="checkbox" class="form-check-input api-checkbox"
                       value="${api.id}" onchange="updateSelection()">
            </td>
            <td>
                <div class="text-truncate" title="${api.name}">${api.name}</div>
            </td>
            <td>
                <span class="method-badge method-${api.method}">${api.method}</span>
            </td>
            <td>
                <code class="text-truncate" title="${api.url}">${api.url}</code>
            </td>
            <td>
                <span class="badge ${api.enabled ? 'bg-success' : 'bg-secondary'}">
                    ${api.enabled ? '启用' : '禁用'}
                </span>
            </td>
            <td>
                <span class="badge bg-info">${api.response.status}</span>
            </td>
            <td>
                <div class="btn-group btn-group-sm">
                    <button class="btn btn-outline-primary" onclick="editAPI('${api.id}')" title="编辑">
                        <i class="bi bi-pencil"></i>
                    </button>
                    <button class="btn btn-outline-${api.enabled ? 'warning' : 'success'}"
                            onclick="toggleAPI('${api.id}')" title="${api.enabled ? '禁用' : '启用'}">
                        <i class="bi bi-${api.enabled ? 'pause' : 'play'}"></i>
                    </button>
                    <button class="btn btn-outline-danger" onclick="deleteAPI('${api.id}')" title="删除">
                        <i class="bi bi-trash"></i>
                    </button>
                </div>
            </td>
        </tr>
    `).join('');
}

// 显示添加API模态框
function showAddApiModal() {
    currentEditingId = null;
    document.getElementById('apiModalTitle').textContent = '添加API';
    document.getElementById('apiForm').reset();

    // 设置默认值
    document.getElementById('responseStatus').value = '200';
    document.getElementById('contentType').value = 'application/json';
    document.getElementById('responseHeaders').value = JSON.stringify({
        "Content-Type": "application/json"
    }, null, 2);
    document.getElementById('responseBody').value = JSON.stringify({
        "errno": 0,
        "error": "",
        "data": {}
    }, null, 2);

    new bootstrap.Modal(document.getElementById('apiModal')).show();
}

// 编辑API
function editAPI(apiId) {
    const api = apis.find(a => a.id === apiId);
    if (!api) return;

    currentEditingId = apiId;
    document.getElementById('apiModalTitle').textContent = '编辑API';

    // 填充表单
    document.getElementById('apiName').value = api.name;
    document.getElementById('apiMethod').value = api.method;
    document.getElementById('apiUrl').value = api.url;
    document.getElementById('responseStatus').value = api.response.status;

    // 设置Content-Type
    const contentType = api.response.headers['Content-Type'] || 'application/json';
    document.getElementById('contentType').value = contentType;

    // 填充响应头和响应体
    document.getElementById('responseHeaders').value = JSON.stringify(api.response.headers, null, 2);
    document.getElementById('responseBody').value = JSON.stringify(api.response.body, null, 2);

    new bootstrap.Modal(document.getElementById('apiModal')).show();
}

// 保存API
async function saveAPI() {
    const form = document.getElementById('apiForm');
    if (!form.checkValidity()) {
        form.reportValidity();
        return;
    }

    try {
        // 获取表单数据
        const name = document.getElementById('apiName').value.trim();
        const method = document.getElementById('apiMethod').value;
        const url = document.getElementById('apiUrl').value.trim();
        const status = parseInt(document.getElementById('responseStatus').value);
        const contentType = document.getElementById('contentType').value;

        // 解析JSON数据
        let headers, body;
        try {
            headers = JSON.parse(document.getElementById('responseHeaders').value);
            body = JSON.parse(document.getElementById('responseBody').value);
        } catch (e) {
            showToast('JSON格式错误，请检查响应头和响应体', 'error');
            return;
        }

        // 确保Content-Type正确
        headers['Content-Type'] = contentType;

        const apiData = {
            name,
            url,
            method,
            response: {
                status,
                headers,
                body
            }
        };

        let response;
        if (currentEditingId) {
            // 更新API
            response = await fetch(`/api/apis/${currentEditingId}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(apiData)
            });
        } else {
            // 创建API
            response = await fetch('/api/apis', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(apiData)
            });
        }

        if (response.ok) {
            showToast(currentEditingId ? 'API更新成功' : 'API创建成功', 'success');
            bootstrap.Modal.getInstance(document.getElementById('apiModal')).hide();
            await loadAPIs();
        } else {
            const error = await response.json();
            throw new Error(error.detail || '保存失败');
        }
    } catch (error) {
        console.error('保存API失败:', error);
        showToast('保存API失败: ' + error.message, 'error');
    }
}

// 切换API状态
async function toggleAPI(apiId) {
    try {
        const response = await fetch(`/api/apis/${apiId}/toggle`, { method: 'POST' });

        if (response.ok) {
            const api = apis.find(a => a.id === apiId);
            const newStatus = api ? !api.enabled : true;
            showToast(`API已${newStatus ? '启用' : '禁用'}`, 'success');
            await loadAPIs();
        } else {
            const error = await response.json();
            throw new Error(error.detail || '操作失败');
        }
    } catch (error) {
        console.error('切换API状态失败:', error);
        showToast('操作失败: ' + error.message, 'error');
    }
}

// 删除API
async function deleteAPI(apiId) {
    const api = apis.find(a => a.id === apiId);
    if (!api) return;

    if (!confirm(`确定要删除API "${api.name}" 吗？`)) {
        return;
    }

    try {
        const response = await fetch(`/api/apis/${apiId}`, { method: 'DELETE' });

        if (response.ok) {
            showToast('API删除成功', 'success');
            await loadAPIs();
        } else {
            const error = await response.json();
            throw new Error(error.detail || '删除失败');
        }
    } catch (error) {
        console.error('删除API失败:', error);
        showToast('删除API失败: ' + error.message, 'error');
    }
}

// 更新选择状态
function updateSelection() {
    const checkboxes = document.querySelectorAll('.api-checkbox:checked');
    selectedApiIds.clear();
    checkboxes.forEach(cb => selectedApiIds.add(cb.value));

    // 更新全选状态
    const selectAll = document.getElementById('selectAll');
    const allCheckboxes = document.querySelectorAll('.api-checkbox');
    selectAll.indeterminate = selectedApiIds.size > 0 && selectedApiIds.size < allCheckboxes.length;
    selectAll.checked = selectedApiIds.size === allCheckboxes.length && allCheckboxes.length > 0;
}

// 切换全选
function toggleSelectAll() {
    const selectAll = document.getElementById('selectAll');
    const checkboxes = document.querySelectorAll('.api-checkbox');

    checkboxes.forEach(cb => {
        cb.checked = selectAll.checked;
    });

    updateSelection();
}

// 批量启用
async function batchEnable() {
    if (selectedApiIds.size === 0) {
        showToast('请先选择要操作的API', 'warning');
        return;
    }

    await batchToggleAPIs(Array.from(selectedApiIds), true);
}

// 批量禁用
async function batchDisable() {
    if (selectedApiIds.size === 0) {
        showToast('请先选择要操作的API', 'warning');
        return;
    }

    await batchToggleAPIs(Array.from(selectedApiIds), false);
}

// 批量切换API状态
async function batchToggleAPIs(apiIds, enabled) {
    try {
        const response = await fetch('/api/apis/batch-toggle', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ api_ids: apiIds, enabled })
        });

        if (response.ok) {
            showToast(`批量${enabled ? '启用' : '禁用'}成功`, 'success');
            selectedApiIds.clear();
            document.getElementById('selectAll').checked = false;
            await loadAPIs();
        } else {
            const error = await response.json();
            throw new Error(error.detail || '批量操作失败');
        }
    } catch (error) {
        console.error('批量操作失败:', error);
        showToast('批量操作失败: ' + error.message, 'error');
    }
}

// 过滤API
function filterAPIs() {
    const searchTerm = document.getElementById('searchInput').value.toLowerCase();
    const methodFilter = document.getElementById('methodFilter').value;
    const statusFilter = document.getElementById('statusFilter').value;

    const rows = document.querySelectorAll('.api-row');

    rows.forEach(row => {
        const apiId = row.dataset.id;
        const api = apis.find(a => a.id === apiId);

        if (!api) {
            row.style.display = 'none';
            return;
        }

        let show = true;

        // 搜索过滤
        if (searchTerm) {
            const searchText = `${api.name} ${api.url}`.toLowerCase();
            show = show && searchText.includes(searchTerm);
        }

        // 方法过滤
        if (methodFilter) {
            show = show && api.method === methodFilter;
        }

        // 状态过滤
        if (statusFilter) {
            const isEnabled = statusFilter === 'enabled';
            show = show && api.enabled === isEnabled;
        }

        row.style.display = show ? '' : 'none';
    });
}

// 导出配置
async function exportConfig() {
    try {
        const response = await fetch('/api/config/export');

        if (response.ok) {
            const blob = await response.blob();
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = 'mitmproxy_config.json';
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            window.URL.revokeObjectURL(url);

            showToast('配置导出成功', 'success');
        } else {
            throw new Error('导出失败');
        }
    } catch (error) {
        console.error('导出配置失败:', error);
        showToast('导出配置失败: ' + error.message, 'error');
    }
}

// 导入配置
async function importConfig(input) {
    const file = input.files[0];
    if (!file) return;

    if (!file.name.endsWith('.json')) {
        showToast('只支持JSON格式的配置文件', 'error');
        return;
    }

    try {
        const formData = new FormData();
        formData.append('file', file);

        const response = await fetch('/api/config/import', {
            method: 'POST',
            body: formData
        });

        if (response.ok) {
            showToast('配置导入成功', 'success');
            await loadAPIs();
        } else {
            const error = await response.json();
            throw new Error(error.detail || '导入失败');
        }
    } catch (error) {
        console.error('导入配置失败:', error);
        showToast('导入配置失败: ' + error.message, 'error');
    } finally {
        input.value = ''; // 清空文件选择
    }
}

// 显示Toast通知
function showToast(message, type = 'info') {
    const toast = document.getElementById('toast');
    const toastBody = document.getElementById('toastBody');
    const toastHeader = toast.querySelector('.toast-header');

    // 设置消息内容
    toastBody.textContent = message;

    // 设置样式
    toast.className = 'toast';
    toastHeader.className = 'toast-header';

    switch (type) {
        case 'success':
            toast.classList.add('bg-success', 'text-white');
            toastHeader.classList.add('bg-success', 'text-white');
            break;
        case 'error':
            toast.classList.add('bg-danger', 'text-white');
            toastHeader.classList.add('bg-danger', 'text-white');
            break;
        case 'warning':
            toast.classList.add('bg-warning');
            toastHeader.classList.add('bg-warning');
            break;
        default:
            toast.classList.add('bg-info', 'text-white');
            toastHeader.classList.add('bg-info', 'text-white');
    }

    // 显示Toast
    new bootstrap.Toast(toast).show();
}

// 格式化JSON
function formatJSON(textarea) {
    try {
        const json = JSON.parse(textarea.value);
        textarea.value = JSON.stringify(json, null, 2);
    } catch (e) {
        showToast('JSON格式错误', 'error');
    }
}

// 添加JSON格式化按钮事件
document.addEventListener('DOMContentLoaded', function() {
    const responseHeaders = document.getElementById('responseHeaders');
    const responseBody = document.getElementById('responseBody');

    if (responseHeaders) {
        responseHeaders.addEventListener('blur', function() {
            if (this.value.trim()) {
                formatJSON(this);
            }
        });
    }

    if (responseBody) {
        responseBody.addEventListener('blur', function() {
            if (this.value.trim()) {
                formatJSON(this);
            }
        });
    }
});

// =============================================================================
// 文件下载拦截管理相关函数
// =============================================================================

// 加载文件下载拦截列表
async function loadDownloads() {
    try {
        const response = await fetch('/api/file-downloads');
        downloads = await response.json();
        renderDownloadTable();
    } catch (error) {
        console.error('加载文件下载列表失败:', error);
        showToast('加载文件下载列表失败', 'error');
    }
}

// 渲染文件下载表格
function renderDownloadTable() {
    const tbody = document.getElementById('downloadTableBody');
    const emptyState = document.getElementById('downloadEmptyState');

    if (downloads.length === 0) {
        tbody.innerHTML = '';
        emptyState.style.display = 'block';
        return;
    }

    emptyState.style.display = 'none';

    tbody.innerHTML = downloads.map(download => `
        <tr class="download-row ${!download.enabled ? 'disabled' : ''}" data-id="${download.id}">
            <td>
                <div class="text-truncate" title="${download.name}">${download.name}</div>
            </td>
            <td>
                <code class="text-truncate" title="${download.url_pattern}">${download.url_pattern}</code>
            </td>
            <td>
                <small class="text-truncate" title="${download.local_file_path}">${download.local_file_path}</small>
            </td>
            <td>
                <span class="badge bg-secondary">${download.content_type || '自动检测'}</span>
            </td>
            <td>
                <span class="badge ${download.enabled ? 'bg-success' : 'bg-secondary'}">
                    ${download.enabled ? '启用' : '禁用'}
                </span>
            </td>
            <td>
                <div class="btn-group btn-group-sm">
                    <button class="btn btn-outline-primary" onclick="editDownload('${download.id}')" title="编辑">
                        <i class="bi bi-pencil"></i>
                    </button>
                    <button class="btn btn-outline-${download.enabled ? 'warning' : 'success'}"
                            onclick="toggleDownload('${download.id}')" title="${download.enabled ? '禁用' : '启用'}">
                        <i class="bi bi-${download.enabled ? 'pause' : 'play'}"></i>
                    </button>
                    <button class="btn btn-outline-danger" onclick="deleteDownload('${download.id}')" title="删除">
                        <i class="bi bi-trash"></i>
                    </button>
                </div>
            </td>
        </tr>
    `).join('');
}

// 显示添加文件下载拦截模态框
function showAddDownloadModal() {
    currentEditingDownloadId = null;
    document.getElementById('downloadModalTitle').textContent = '添加文件下载拦截';
    document.getElementById('downloadForm').reset();

    new bootstrap.Modal(document.getElementById('downloadModal')).show();
}

// 编辑文件下载拦截
function editDownload(downloadId) {
    const download = downloads.find(d => d.id === downloadId);
    if (!download) return;

    currentEditingDownloadId = downloadId;
    document.getElementById('downloadModalTitle').textContent = '编辑文件下载拦截';

    // 填充表单
    document.getElementById('downloadName').value = download.name;
    document.getElementById('downloadUrlPattern').value = download.url_pattern;
    document.getElementById('downloadFilePath').value = download.local_file_path;
    document.getElementById('downloadContentType').value = download.content_type || '';

    new bootstrap.Modal(document.getElementById('downloadModal')).show();
}

// 保存文件下载拦截
async function saveDownload() {
    const form = document.getElementById('downloadForm');
    if (!form.checkValidity()) {
        form.reportValidity();
        return;
    }

    try {
        // 获取表单数据
        const name = document.getElementById('downloadName').value.trim();
        const urlPattern = document.getElementById('downloadUrlPattern').value.trim();
        const filePath = document.getElementById('downloadFilePath').value.trim();
        const contentType = document.getElementById('downloadContentType').value || null;

        const downloadData = {
            name,
            url_pattern: urlPattern,
            local_file_path: filePath,
            content_type: contentType
        };

        let response;
        if (currentEditingDownloadId) {
            // 更新下载拦截
            response = await fetch(`/api/file-downloads/${currentEditingDownloadId}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(downloadData)
            });
        } else {
            // 创建下载拦截
            response = await fetch('/api/file-downloads', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(downloadData)
            });
        }

        if (response.ok) {
            showToast(currentEditingDownloadId ? '文件下载拦截更新成功' : '文件下载拦截创建成功', 'success');
            bootstrap.Modal.getInstance(document.getElementById('downloadModal')).hide();
            await loadDownloads();
        } else {
            const error = await response.json();
            throw new Error(error.detail || '保存失败');
        }
    } catch (error) {
        console.error('保存文件下载拦截失败:', error);
        showToast('保存文件下载拦截失败: ' + error.message, 'error');
    }
}

// 切换文件下载拦截状态
async function toggleDownload(downloadId) {
    try {
        const response = await fetch(`/api/file-downloads/${downloadId}/toggle`, { method: 'POST' });

        if (response.ok) {
            const download = downloads.find(d => d.id === downloadId);
            const newStatus = download ? !download.enabled : true;
            showToast(`文件下载拦截已${newStatus ? '启用' : '禁用'}`, 'success');
            await loadDownloads();
        } else {
            const error = await response.json();
            throw new Error(error.detail || '操作失败');
        }
    } catch (error) {
        console.error('切换文件下载拦截状态失败:', error);
        showToast('操作失败: ' + error.message, 'error');
    }
}

// 删除文件下载拦截
async function deleteDownload(downloadId) {
    const download = downloads.find(d => d.id === downloadId);
    if (!download) return;

    if (!confirm(`确定要删除文件下载拦截 "${download.name}" 吗？`)) {
        return;
    }

    try {
        const response = await fetch(`/api/file-downloads/${downloadId}`, { method: 'DELETE' });

        if (response.ok) {
            showToast('文件下载拦截删除成功', 'success');
            await loadDownloads();
        } else {
            const error = await response.json();
            throw new Error(error.detail || '删除失败');
        }
    } catch (error) {
        console.error('删除文件下载拦截失败:', error);
        showToast('删除文件下载拦截失败: ' + error.message, 'error');
    }
}

// 过滤文件下载拦截
function filterDownloads() {
    const searchTerm = document.getElementById('downloadSearchInput').value.toLowerCase();
    const statusFilter = document.getElementById('downloadStatusFilter').value;

    const rows = document.querySelectorAll('.download-row');

    rows.forEach(row => {
        const downloadId = row.dataset.id;
        const download = downloads.find(d => d.id === downloadId);

        if (!download) {
            row.style.display = 'none';
            return;
        }

        let show = true;

        // 搜索过滤
        if (searchTerm) {
            const searchText = `${download.name} ${download.url_pattern}`.toLowerCase();
            show = show && searchText.includes(searchTerm);
        }

        // 状态过滤
        if (statusFilter) {
            const isEnabled = statusFilter === 'enabled';
            show = show && download.enabled === isEnabled;
        }

        row.style.display = show ? '' : 'none';
    });
}

// =============================================================================
// 请求映射管理相关函数
// =============================================================================

// 加载请求映射列表
async function loadMappings() {
    try {
        const response = await fetch('/api/request-mappings');
        mappings = await response.json();
        renderMappingTable();
    } catch (error) {
        console.error('加载请求映射列表失败:', error);
        showToast('加载请求映射列表失败', 'error');
    }
}

// 渲染请求映射表格
function renderMappingTable() {
    const tbody = document.getElementById('mappingTableBody');
    const emptyState = document.getElementById('mappingEmptyState');

    if (mappings.length === 0) {
        tbody.innerHTML = '';
        emptyState.style.display = 'block';
        return;
    }

    emptyState.style.display = 'none';

    tbody.innerHTML = mappings.map(mapping => `
        <tr class="mapping-row ${!mapping.enabled ? 'disabled' : ''}" data-id="${mapping.id}">
            <td>
                <div class="text-truncate" title="${mapping.name}">${mapping.name}</div>
            </td>
            <td>
                <code class="text-truncate" title="${mapping.url_pattern}">${mapping.url_pattern}</code>
            </td>
            <td>
                <span class="badge bg-info">${mapping.target_host}:${mapping.target_port}</span>
            </td>
            <td>
                <div class="d-flex gap-1 flex-wrap">
                    ${mapping.methods.map(method => `<span class="badge bg-secondary">${method}</span>`).join('')}
                </div>
            </td>
            <td>
                <span class="badge ${mapping.enabled ? 'bg-success' : 'bg-secondary'}">
                    ${mapping.enabled ? '启用' : '禁用'}
                </span>
            </td>
            <td>
                <div class="btn-group btn-group-sm">
                    <button class="btn btn-outline-primary" onclick="editMapping('${mapping.id}')" title="编辑">
                        <i class="bi bi-pencil"></i>
                    </button>
                    <button class="btn btn-outline-${mapping.enabled ? 'warning' : 'success'}"
                            onclick="toggleMapping('${mapping.id}')" title="${mapping.enabled ? '禁用' : '启用'}">
                        <i class="bi bi-${mapping.enabled ? 'pause' : 'play'}"></i>
                    </button>
                    <button class="btn btn-outline-danger" onclick="deleteMapping('${mapping.id}')" title="删除">
                        <i class="bi bi-trash"></i>
                    </button>
                </div>
            </td>
        </tr>
    `).join('');
}

// 显示添加请求映射模态框
function showAddMappingModal() {
    currentEditingMappingId = null;
    document.getElementById('mappingModalTitle').textContent = '添加请求映射';
    document.getElementById('mappingForm').reset();
    
    // 设置默认值
    document.getElementById('mappingTargetHost').value = 'localhost';
    document.getElementById('methodGET').checked = true;
    document.getElementById('methodPOST').checked = true;

    new bootstrap.Modal(document.getElementById('mappingModal')).show();
}

// 编辑请求映射
function editMapping(mappingId) {
    const mapping = mappings.find(m => m.id === mappingId);
    if (!mapping) return;

    currentEditingMappingId = mappingId;
    document.getElementById('mappingModalTitle').textContent = '编辑请求映射';

    // 填充表单
    document.getElementById('mappingName').value = mapping.name;
    document.getElementById('mappingUrlPattern').value = mapping.url_pattern;
    document.getElementById('mappingTargetHost').value = mapping.target_host;
    document.getElementById('mappingTargetPort').value = mapping.target_port;

    // 设置HTTP方法复选框
    const methods = ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'HEAD', 'OPTIONS'];
    methods.forEach(method => {
        const checkbox = document.getElementById('method' + method);
        if (checkbox) {
            checkbox.checked = mapping.methods.includes(method);
        }
    });

    new bootstrap.Modal(document.getElementById('mappingModal')).show();
}

// 保存请求映射
async function saveMapping() {
    const form = document.getElementById('mappingForm');
    if (!form.checkValidity()) {
        form.reportValidity();
        return;
    }

    try {
        // 获取表单数据
        const name = document.getElementById('mappingName').value.trim();
        const urlPattern = document.getElementById('mappingUrlPattern').value.trim();
        const targetHost = document.getElementById('mappingTargetHost').value.trim();
        const targetPort = parseInt(document.getElementById('mappingTargetPort').value);

        // 获取选中的HTTP方法
        const methods = [];
        const methodCheckboxes = ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'HEAD', 'OPTIONS'];
        methodCheckboxes.forEach(method => {
            const checkbox = document.getElementById('method' + method);
            if (checkbox && checkbox.checked) {
                methods.push(method);
            }
        });

        if (methods.length === 0) {
            showToast('请至少选择一种HTTP方法', 'warning');
            return;
        }

        const mappingData = {
            name,
            url_pattern: urlPattern,
            target_host: targetHost,
            target_port: targetPort,
            methods
        };

        let response;
        if (currentEditingMappingId) {
            // 更新请求映射
            response = await fetch(`/api/request-mappings/${currentEditingMappingId}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(mappingData)
            });
        } else {
            // 创建请求映射
            response = await fetch('/api/request-mappings', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(mappingData)
            });
        }

        if (response.ok) {
            showToast(currentEditingMappingId ? '请求映射更新成功' : '请求映射创建成功', 'success');
            bootstrap.Modal.getInstance(document.getElementById('mappingModal')).hide();
            await loadMappings();
        } else {
            const error = await response.json();
            throw new Error(error.detail || '保存失败');
        }
    } catch (error) {
        console.error('保存请求映射失败:', error);
        showToast('保存请求映射失败: ' + error.message, 'error');
    }
}

// 切换请求映射状态
async function toggleMapping(mappingId) {
    try {
        const response = await fetch(`/api/request-mappings/${mappingId}/toggle`, { method: 'POST' });

        if (response.ok) {
            const mapping = mappings.find(m => m.id === mappingId);
            const newStatus = mapping ? !mapping.enabled : true;
            showToast(`请求映射已${newStatus ? '启用' : '禁用'}`, 'success');
            await loadMappings();
        } else {
            const error = await response.json();
            throw new Error(error.detail || '操作失败');
        }
    } catch (error) {
        console.error('切换请求映射状态失败:', error);
        showToast('操作失败: ' + error.message, 'error');
    }
}

// 删除请求映射
async function deleteMapping(mappingId) {
    const mapping = mappings.find(m => m.id === mappingId);
    if (!mapping) return;

    if (!confirm(`确定要删除请求映射 "${mapping.name}" 吗？`)) {
        return;
    }

    try {
        const response = await fetch(`/api/request-mappings/${mappingId}`, { method: 'DELETE' });

        if (response.ok) {
            showToast('请求映射删除成功', 'success');
            await loadMappings();
        } else {
            const error = await response.json();
            throw new Error(error.detail || '删除失败');
        }
    } catch (error) {
        console.error('删除请求映射失败:', error);
        showToast('删除请求映射失败: ' + error.message, 'error');
    }
}

// 过滤请求映射
function filterMappings() {
    const searchTerm = document.getElementById('mappingSearchInput').value.toLowerCase();
    const statusFilter = document.getElementById('mappingStatusFilter').value;

    const rows = document.querySelectorAll('.mapping-row');

    rows.forEach(row => {
        const mappingId = row.dataset.id;
        const mapping = mappings.find(m => m.id === mappingId);

        if (!mapping) {
            row.style.display = 'none';
            return;
        }

        let show = true;

        // 搜索过滤
        if (searchTerm) {
            const searchText = `${mapping.name} ${mapping.url_pattern}`.toLowerCase();
            show = show && searchText.includes(searchTerm);
        }

        // 状态过滤
        if (statusFilter) {
            const isEnabled = statusFilter === 'enabled';
            show = show && mapping.enabled === isEnabled;
        }

        row.style.display = show ? '' : 'none';
    });
}

// =============================================================================
// ADB设备管理相关函数
// =============================================================================

// 加载ADB设备列表
async function loadAdbDevices() {
    try {
        const response = await fetch('/api/adb/devices');

        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }

        const data = await response.json();
        adbDevices = data.devices || [];
        await renderDeviceList();
    } catch (error) {
        console.error('获取ADB设备列表失败:', error);
        // 确保即使失败也显示空状态
        adbDevices = [];
        await renderDeviceList();
    }
}

// 渲染设备列表
async function renderDeviceList() {
    const deviceList = document.getElementById('deviceList');
    const noDevices = document.getElementById('noDevices');

    if (!deviceList) {
        return;
    }

    if (!noDevices) {
        return;
    }

    if (adbDevices.length === 0) {
        noDevices.style.display = 'block';
        const items = deviceList.querySelectorAll('.list-group-item');
        items.forEach(item => item.remove());
        return;
    }

    noDevices.style.display = 'none';

    // 获取每个设备的代理信息
    for (const device of adbDevices) {
        let deviceItem = document.getElementById(`device-${device.id}`);

        if (!deviceItem) {
            deviceItem = document.createElement('div');
            deviceItem.id = `device-${device.id}`;
            deviceItem.className = 'list-group-item';
            deviceList.appendChild(deviceItem);
        }

        // 获取设备代理设置
        try {
            const proxyResponse = await fetch(`/api/adb/devices/${device.id}/proxy`);
            const proxyData = await proxyResponse.json();

            const deviceProxy = proxyData.proxy;
            const isProxySet = deviceProxy && deviceProxy !== ':0';
            const isMatchingProxy = isProxySet && proxyServerAddress && deviceProxy === proxyServerAddress;

            deviceItem.innerHTML = `
                <div class="d-flex justify-content-between align-items-center">
                    <div>
                        <h6 class="mb-1">
                            <i class="bi bi-phone"></i>
                            设备: ${device.id}
                        </h6>
                        <small class="text-muted">
                            代理设置: <span class="badge ${isProxySet ? (isMatchingProxy ? 'bg-success' : 'bg-warning') : 'bg-secondary'}">
                                ${isProxySet ? deviceProxy : '未设置'}
                            </span>
                        </small>
                    </div>
                    <div>
                        ${proxyServerAddress ? `
                            <button class="btn btn-sm ${isMatchingProxy ? 'btn-danger' : 'btn-primary'}"
                                    onclick="toggleDeviceProxy('${device.id}', ${isMatchingProxy})">
                                <i class="bi bi-${isMatchingProxy ? 'x-circle' : 'arrow-repeat'}"></i>
                                ${isMatchingProxy ? '清除代理' : '设置代理'}
                            </button>
                        ` : `
                            <button class="btn btn-sm btn-secondary" disabled>
                                <i class="bi bi-exclamation-circle"></i>
                                请先启动代理服务
                            </button>
                        `}
                    </div>
                </div>
            `;
        } catch (error) {
            console.error(`获取设备 ${device.id} 代理设置失败:`, error);
        }
    }

    // 移除不存在的设备
    const currentDeviceIds = adbDevices.map(d => d.id);
    const deviceItems = deviceList.querySelectorAll('.list-group-item');
    deviceItems.forEach(item => {
        const deviceId = item.id.replace('device-', '');
        if (!currentDeviceIds.includes(deviceId)) {
            item.remove();
        }
    });
}

// 切换设备代理
async function toggleDeviceProxy(deviceId, isCurrentlySet) {
    try {
        const proxy = isCurrentlySet ? null : proxyServerAddress;

        const response = await fetch(`/api/adb/devices/${deviceId}/proxy`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ proxy })
        });

        if (response.ok) {
            showToast(isCurrentlySet ? '代理已清除' : '代理已设置', 'success');
            await loadAdbDevices();
        } else {
            const error = await response.json();
            throw new Error(error.detail || '操作失败');
        }
    } catch (error) {
        console.error('设置设备代理失败:', error);
        showToast('设置设备代理失败: ' + error.message, 'error');
    }
}
// =============================================================================
// 抓包监控相关函数
// =============================================================================

let captures = [];
let allCaptures = [];  // 存储所有抓包数据用于过滤
let websocket = null;

// 连接WebSocket
function connectWebSocket() {
    if (websocket && websocket.readyState === WebSocket.OPEN) {
        return; // 已经连接
    }

    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}/ws/captures`;

    websocket = new WebSocket(wsUrl);

    websocket.onopen = function() {
        console.log('WebSocket连接已建立');
        updateWebSocketStatus(true);
    };

    websocket.onmessage = function(event) {
        const data = JSON.parse(event.data);
        if (data.type === 'new_capture') {
            addCaptureToList(data.data);
        }
    };

    websocket.onclose = function() {
        console.log('WebSocket连接已关闭');
        updateWebSocketStatus(false);
        // 5秒后尝试重连
        setTimeout(connectWebSocket, 5000);
    };

    websocket.onerror = function(error) {
        console.error('WebSocket错误:', error);
        updateWebSocketStatus(false);
    };
}

// 更新WebSocket状态
function updateWebSocketStatus(connected) {
    const wsStatus = document.getElementById('wsStatus');
    if (wsStatus) {
        if (connected) {
            wsStatus.innerHTML = '<i class="bi bi-circle-fill text-success"></i> 已连接';
            wsStatus.className = 'badge bg-success me-2';
        } else {
            wsStatus.innerHTML = '<i class="bi bi-circle-fill text-danger"></i> 已断开';
            wsStatus.className = 'badge bg-danger me-2';
        }
    }
}

// 加载抓包列表
async function loadCaptures() {
    try {
        const response = await fetch('/api/captures?limit=100');
        allCaptures = await response.json();
        captures = [...allCaptures];
        renderCaptureTable();
    } catch (error) {
        console.error('加载抓包列表失败:', error);
        showToast('加载抓包列表失败', 'error');
    }
}

// 添加新抓包到列表 (实时)
function addCaptureToList(capture) {
    allCaptures.unshift(capture);  // 添加到开头
    if (allCaptures.length > 1000) {
        allCaptures = allCaptures.slice(0, 1000);  // 限制最大数量
    }
    filterCaptures();  // 应用当前过滤条件
}

// 渲染抓包表格
function renderCaptureTable() {
    const tbody = document.getElementById('captureTableBody');
    const emptyState = document.getElementById('captureEmptyState');
    const countBadge = document.getElementById('captureCount');

    countBadge.textContent = captures.length;

    if (captures.length === 0) {
        tbody.innerHTML = '';
        emptyState.style.display = 'block';
        return;
    }

    emptyState.style.display = 'none';

    tbody.innerHTML = captures.map(capture => {
        const statusClass = getStatusClass(capture.response?.status_code);
        const methodClass = getMethodClass(capture.request.method);
        const duration = capture.response?.duration || '-';
        const time = new Date(capture.timestamp * 1000).toLocaleTimeString();

        // 检查是否已配置API
        const url = new URL(capture.request.url);
        const apiUrl = url.host + url.pathname;
        const isConfigured = apis.some(api =>
            api.url === apiUrl &&
            api.method === capture.request.method &&
            api.enabled
        );

        return `
            <tr onclick="showCaptureDetail('${capture.id}')" style="cursor: pointer;" class="${isConfigured ? 'table-success' : ''}">
                <td>
                    <span class="badge bg-${methodClass}">${capture.request.method}</span>
                    ${isConfigured ? '<i class="bi bi-check-circle-fill text-success ms-1" title="已配置API"></i>' : ''}
                </td>
                <td><span class="badge bg-${statusClass}">${capture.response?.status_code || '-'}</span></td>
                <td class="text-truncate" style="max-width: 400px;" title="${capture.request.url}">
                    ${capture.request.url}
                </td>
                <td>${duration}ms</td>
                <td><small>${time}</small></td>
                <td>
                    <button class="btn btn-sm btn-outline-primary" onclick="event.stopPropagation(); showCaptureDetail('${capture.id}')" title="查看详情">
                        <i class="bi bi-eye"></i>
                    </button>
                    <button class="btn btn-sm btn-outline-${isConfigured ? 'warning' : 'success'}" onclick="event.stopPropagation(); addCaptureToAPI('${capture.id}')" title="${isConfigured ? '更新API配置' : '添加到API配置'}">
                        <i class="bi bi-${isConfigured ? 'arrow-repeat' : 'plus-circle'}"></i>
                    </button>
                </td>
            </tr>
        `;
    }).join('');
}

// 获取状态码样式类
function getStatusClass(statusCode) {
    if (!statusCode) return 'secondary';
    if (statusCode >= 200 && statusCode < 300) return 'success';
    if (statusCode >= 300 && statusCode < 400) return 'info';
    if (statusCode >= 400 && statusCode < 500) return 'warning';
    if (statusCode >= 500) return 'danger';
    return 'secondary';
}

// 获取方法样式类
function getMethodClass(method) {
    const methodColors = {
        'GET': 'primary',
        'POST': 'success',
        'PUT': 'warning',
        'DELETE': 'danger',
        'PATCH': 'info'
    };
    return methodColors[method] || 'secondary';
}

// 显示抓包详情
function showCaptureDetail(captureId) {
    const capture = allCaptures.find(c => c.id === captureId);
    if (!capture) return;

    // 填充请求信息
    document.getElementById('detailRequestUrl').textContent = capture.request.url;
    document.getElementById('detailRequestHeaders').textContent = 
        JSON.stringify(capture.request.headers, null, 2);
    document.getElementById('detailRequestBody').textContent = 
        capture.request.request_body || '(无请求体)';

    // 填充响应信息
    if (capture.response) {
        document.getElementById('detailResponseStatus').innerHTML = 
            `<span class="badge bg-${getStatusClass(capture.response.status_code)}">${capture.response.status_code}</span>`;
        document.getElementById('detailResponseHeaders').textContent = 
            JSON.stringify(capture.response.headers, null, 2);
        
        // 尝试格式化JSON响应
        let responseBody = capture.response.response_body || '(无响应体)';
        try {
            const json = JSON.parse(responseBody);
            responseBody = JSON.stringify(json, null, 2);
        } catch (e) {
            // 不是JSON，保持原样
        }
        document.getElementById('detailResponseBody').textContent = responseBody;
    } else {
        document.getElementById('detailResponseStatus').textContent = '(无响应)';
        document.getElementById('detailResponseHeaders').textContent = '';
        document.getElementById('detailResponseBody').textContent = '';
    }

    new bootstrap.Modal(document.getElementById('captureDetailModal')).show();
}

// 过滤抓包数据
function filterCaptures() {
    const searchTerm = document.getElementById('captureSearchInput')?.value.toLowerCase() || '';
    const methodFilter = document.getElementById('captureMethodFilter')?.value || '';
    const statusFilter = document.getElementById('captureStatusFilter')?.value || '';

    captures = allCaptures.filter(capture => {
        let show = true;

        // 搜索过滤 (URL、请求体、响应体)
        if (searchTerm) {
            const searchText = `
                ${capture.request.url}
                ${capture.request.request_body}
                ${capture.response?.response_body || ''}
            `.toLowerCase();
            show = show && searchText.includes(searchTerm);
        }

        // 方法过滤
        if (methodFilter) {
            show = show && capture.request.method === methodFilter;
        }

        // 状态码过滤
        if (statusFilter && capture.response) {
            const status = capture.response.status_code;
            if (statusFilter === '2xx') show = show && status >= 200 && status < 300;
            else if (statusFilter === '3xx') show = show && status >= 300 && status < 400;
            else if (statusFilter === '4xx') show = show && status >= 400 && status < 500;
            else if (statusFilter === '5xx') show = show && status >= 500;
        }

        return show;
    });

    renderCaptureTable();
}

// 清空抓包数据
async function clearCaptures() {
    if (!confirm('确定要清空所有抓包数据吗？')) {
        return;
    }

    try {
        const response = await fetch('/api/captures', { method: 'DELETE' });
        if (response.ok) {
            allCaptures = [];
            captures = [];
            renderCaptureTable();
            showToast('抓包数据已清空', 'success');
        } else {
            throw new Error('清空失败');
        }
    } catch (error) {
        console.error('清空抓包数据失败:', error);
        showToast('清空抓包数据失败: ' + error.message, 'error');
    }
}

// 将抓包记录添加到API配置
async function addCaptureToAPI(captureId) {
    const capture = allCaptures.find(c => c.id === captureId);
    if (!capture) {
        showToast('未找到抓包记录', 'error');
        return;
    }

    if (!capture.response) {
        showToast('该请求没有响应数据，无法添加', 'warning');
        return;
    }

    try {
        // 解析URL
        const url = new URL(capture.request.url);
        // API配置的URL格式：host + pathname（不包括协议和查询参数）
        const apiUrl = url.host + url.pathname;

        // 解析响应体
        let responseBody = {};
        try {
            if (capture.response.response_body) {
                responseBody = JSON.parse(capture.response.response_body);
            }
        } catch (e) {
            // 如果不是JSON，作为文本处理
            responseBody = { data: capture.response.response_body };
        }

        // 构建API配置数据
        const apiData = {
            name: `${capture.request.method} ${url.host}${url.pathname}`,
            url: apiUrl,
            method: capture.request.method,
            response: {
                status: capture.response.status_code,
                headers: capture.response.headers,
                body: responseBody
            }
        };

        // 发送请求创建API配置
        const response = await fetch('/api/apis', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(apiData)
        });

        if (response.ok) {
            showToast('API配置添加成功', 'success');
            // 重新加载API列表
            await loadAPIs();

            // 刷新抓包列表以更新标志状态
            renderCaptureTable();

            // 提示用户切换到API管理标签页
            if (confirm('API配置已添加成功，是否切换到API配置管理页面查看？')) {
                // 切换到API管理标签页
                const apiTab = document.getElementById('api-tab');
                if (apiTab) {
                    const tab = new bootstrap.Tab(apiTab);
                    tab.show();
                }
            }
        } else {
            const error = await response.json();
            throw new Error(error.detail || '添加失败');
        }
    } catch (error) {
        console.error('添加API配置失败:', error);
        showToast('添加API配置失败: ' + error.message, 'error');
    }
}
