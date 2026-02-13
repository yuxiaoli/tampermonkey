// ==UserScript==
// @name         Jina Reader Pro - 网页转 Markdown
// @namespace    http://tampermonkey.net/
// @version      1.0
// @description  一键将任何网页转换为大模型友好的 Markdown 格式
// @author       Your Name
// @match        *://*/*
// @grant        GM_xmlhttpRequest
// @grant        GM_setClipboard
// @grant        GM_notification
// @connect      r.jina.ai
// ==/UserScript==

(function() {
    'use strict';

    // ============ 配置区域 ============
    // 在这里填入你的 Jina API Key（可在 https://jina.ai/reader/ 免费获取）
    // 留空也能用，但有 API Key 可获得更高速率限制
    const API_KEY = '';

    // 等待页面加载的超时时间（秒），对动态页面很有用
    const TIMEOUT = 30;

    // 快捷键设置（默认 command/control + J）
    const HOTKEY = { ctrlOrCmd: true, key: 'j' };
    // ============ 配置结束 ============

    // 创建悬浮按钮
    function createFloatButton() {
        const btn = document.createElement('div');
        btn.id = 'jina-reader-btn';
        btn.innerHTML = '📄';
        btn.title = '转换为 Markdown (Ctrl/Cmd+J)';
        btn.style.cssText = `
            position: fixed;
            bottom: 20px;
            right: 20px;
            width: 50px;
            height: 50px;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            border-radius: 50%;
            display: flex;
            align-items: center;
            justify-content: center;
            font-size: 24px;
            cursor: pointer;
            box-shadow: 0 4px 15px rgba(102, 126, 234, 0.4);
            z-index: 999999;
            transition: all 0.3s ease;
        `;
        btn.addEventListener('click', convertPage);
        document.body.appendChild(btn);
        return btn;
    }

    // 核心转换函数
    function convertPage() {
        const btn = document.getElementById('jina-reader-btn');
        if (btn) {
            btn.innerHTML = '⏳';
            btn.style.opacity = '0.7';
        }

        const headers = { 'x-timeout': String(TIMEOUT) };
        if (API_KEY) headers['Authorization'] = 'Bearer ' + API_KEY;

        GM_xmlhttpRequest({
            method: 'GET',
            url: 'https://r.jina.ai/' + location.href,
            headers: headers,
            timeout: (TIMEOUT + 10) * 1000,
            onload: function(response) {
                if (btn) {
                    btn.innerHTML = '📄';
                    btn.style.opacity = '1';
                }
                if (response.status === 200) {
                    showResult(response.responseText);
                } else {
                    alert('请求失败: HTTP ' + response.status);
                }
            },
            onerror: function() {
                if (btn) {
                    btn.innerHTML = '📄';
                    btn.style.opacity = '1';
                }
                alert('网络错误');
            }
        });
    }

    // 显示结果弹窗
    function showResult(content) {
        const overlay = document.createElement('div');
        overlay.style.cssText = `
            position: fixed; top: 0; left: 0; width: 100%; height: 100%;
            background: rgba(0,0,0,0.8); z-index: 9999999;
            display: flex; align-items: center; justify-content: center;
        `;

        const modal = document.createElement('div');
        modal.style.cssText = `
            width: 90%; max-width: 900px; height: 80%;
            background: #1e1e1e; border-radius: 12px;
            display: flex; flex-direction: column; overflow: hidden;
        `;

        modal.innerHTML = `
            <div style="padding:15px 20px;background:#2d2d2d;display:flex;justify-content:space-between;align-items:center;">
                <span style="color:#fff;font-size:16px;">📄 Markdown 结果</span>
                <div>
                    <button id="jina-copy" style="background:#4CAF50;color:#fff;border:none;padding:8px 16px;border-radius:6px;cursor:pointer;margin-right:10px;">📋 复制</button>
                    <button id="jina-download" style="background:#2196F3;color:#fff;border:none;padding:8px 16px;border-radius:6px;cursor:pointer;margin-right:10px;">💾 下载</button>
                    <button id="jina-close" style="background:#666;color:#fff;border:none;padding:8px 16px;border-radius:6px;cursor:pointer;">✕ 关闭</button>
                </div>
            </div>
            <pre style="flex:1;margin:0;padding:20px;overflow:auto;color:#d4d4d4;font-family:monospace;font-size:14px;white-space:pre-wrap;"></pre>
        `;

        modal.querySelector('pre').textContent = content;
        overlay.appendChild(modal);
        document.body.appendChild(overlay);

        // Use scoped selectors to avoid conflicts
        modal.querySelector('#jina-copy').onclick = function() {
            GM_setClipboard(content, 'text');
            this.textContent = '✅ 已复制';
            setTimeout(() => { this.textContent = '📋 复制'; }, 2000);
        };

        modal.querySelector('#jina-download').onclick = function() {
            const blob = new Blob([content], { type: 'text/markdown' });
            const a = document.createElement('a');
            a.href = URL.createObjectURL(blob);
            a.download = (document.title || 'page').replace(/[\/\\:*?"<>|]/g, '-') + '.md';
            a.click();
        };

        const closeFunc = () => overlay.remove();
        modal.querySelector('#jina-close').onclick = closeFunc;
        overlay.onclick = (e) => { if (e.target === overlay) closeFunc(); };
    }

    // 监听快捷键
    document.addEventListener('keydown', function(e) {
        const ctrlOrCmdPressed = e.ctrlKey || e.metaKey;
        if (ctrlOrCmdPressed === HOTKEY.ctrlOrCmd && e.key.toLowerCase() === HOTKEY.key.toLowerCase()) {
            e.preventDefault();
            convertPage();
        }
    });

    // 初始化
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', createFloatButton);
    } else {
        createFloatButton();
    }
})();
