// 全局变量
let apis = [];
let downloads = [];
let currentEditingId = null;
let currentEditingDownloadId = null;
let selectedApiIds = new Set();

// 页面加载完成后初始化
document.addEventListener('DOMContentLoaded', function() {
    initializeApp();
});

// 初始化应用
async function initializeApp() {
    await checkProxyStatus();
    await loadAPIs();
    await loadDownloads();

    // 定期检查代理状态
    setInterval(checkProxyStatus, 5000);

    // 标签页切换事件监听
    document.getElementById('download-tab').addEventListener('shown.bs.tab', function() {
        loadDownloads();
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
        proxyInfo.style.display = 'block';
        startBtn.disabled = true;
        stopBtn.disabled = false;
    } else {
        indicator.className = 'status-indicator status-stopped';
        statusText.textContent = '代理服务已停止';
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