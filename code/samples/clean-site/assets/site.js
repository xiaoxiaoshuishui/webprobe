/* ==========================================================================
   Clean Docs 站点 — 主脚本 assets/site.js
   普通 <script>（非 module），ES5/ES2015 兼容，无构建、无外部依赖。

   这是 WebProbe 的"干净对照组"，因此本文件的所有代码都必须满足：
     * 不抛异常（所有可能失败的分支都有 try/catch 或 .catch）；
     * 不产生未处理的 Promise 拒绝；
     * 不调用 console.error / console.warn；
     * 不发外部请求，只 fetch 站点自带的静态 JSON（/api/status.json -> /data/status.json）；
     * 只有可终止的循环，没有阻塞主线程的长任务。
   ========================================================================== */
(function () {
  'use strict';

  /* ------------------------------------------------------------------ utils */

  function $(selector) {
    return document.querySelector(selector);
  }

  function $$(selector) {
    return Array.prototype.slice.call(document.querySelectorAll(selector));
  }

  function on(root, event, selector, handler) {
    if (!root) return;
    root.addEventListener(event, function (evt) {
      var target = evt.target;
      if (target && typeof target.closest === 'function' && target.closest(selector)) {
        handler(evt, target.closest(selector));
      }
    });
  }

  function setText(selector, value) {
    var el = $(selector);
    if (el) el.textContent = String(value);
    return el;
  }

  function setStatusClass(el, cls) {
    if (!el) return;
    el.className = 'status__dot' + (cls ? ' ' + cls : '');
  }

  function nowClock() {
    var d = new Date();
    function pad(n) {
      return n < 10 ? '0' + n : String(n);
    }
    return pad(d.getHours()) + ':' + pad(d.getMinutes()) + ':' + pad(d.getSeconds());
  }

  /* ------------------------------------------------- 健康检查（正常 fetch）---
     只请求站点自带的静态文件 /api/status.json。
     该文件真实存在于仓库里（api/status.json），由静态服务器直接返回 HTTP 200，
     因此不依赖任何服务端重写/别名规则。这是对照组里唯一的一次网络请求。
     ------------------------------------------------------------------------ */

  function renderStatus(payload) {
    var badge = $('#status-badge');
    if (badge) {
      var state = payload && payload.state ? payload.state : 'unknown';
      setText('#status-text', state === 'ok' ? '全部服务正常' : '状态：' + state);
      setStatusClass($('#status-dot'), state === 'ok' ? 'status__dot--ok' : '');
    }
    setText('#status-version', payload.version ? 'v' + payload.version : '—');
    setText('#status-generated', payload.generatedAt || '—');
    setText('#status-checked-at', nowClock());

    var list = $('#service-list');
    if (list && payload && Array.isArray(payload.services)) {
      list.textContent = '';
      payload.services.forEach(function (svc) {
        var row = document.createElement('div');
        row.className = 'kv';
        var name = document.createElement('span');
        name.textContent = svc.name;
        var value = document.createElement('span');
        value.className = svc.status === 'ok' ? 'muted' : '';
        value.textContent = svc.status + ' · ' + svc.latencyMs + 'ms';
        row.appendChild(name);
        row.appendChild(value);
        list.appendChild(row);
      });
    }
  }

  function loadStatus() {
    var btn = $('#btn-refresh-status');
    if (btn) {
      btn.disabled = true;
      btn.textContent = '检查中…';
    }
    setText('#status-note', '正在检查服务状态…');

    return fetch('/api/status.json', {
      method: 'GET',
      headers: { Accept: 'application/json' },
      cache: 'no-store',
    })
      .then(function (res) {
        if (!res.ok) {
          // 干净站点：预期永远不走到这里；真走到了也只是显示提示，不抛异常、不打印 error。
          throw new Error('status endpoint returned HTTP ' + res.status);
        }
        return res.json();
      })
      .then(function (payload) {
        renderStatus(payload);
        setText('#status-note', '状态数据来自 /api/status.json（静态 JSON，HTTP 200）');
        return payload;
      })
      .catch(function (err) {
        // 关键：必须有 catch，否则会产生 unhandledrejection（对照组不允许出现）。
        setText('#status-note', '状态暂时不可用：' + (err && err.message ? err.message : '未知原因'));
        setStatusClass($('#status-dot'), 'status__dot--down');
        return null;
      })
      .then(function (result) {
        if (btn) {
          btn.disabled = false;
          btn.textContent = '重新检查';
        }
        return result;
      });
  }

  /* ----------------------------------------------------------- 表单校验 --- */

  var EMAIL_RE = /^[^\s@]+@[^\s@]+\.[A-Za-z]{2,}$/;

  function showError(fieldId, message) {
    var el = document.getElementById(fieldId + '-error');
    if (el) el.textContent = message || '';
    var input = document.getElementById(fieldId);
    if (input) input.setAttribute('aria-invalid', message ? 'true' : 'false');
    return !message;
  }

  function validateContact(form) {
    var ok = true;
    var name = form.elements.namedItem('name');
    var email = form.elements.namedItem('email');
    var topic = form.elements.namedItem('topic');
    var message = form.elements.namedItem('message');

    var nameValue = name && name.value ? name.value.trim() : '';
    var emailValue = email && email.value ? email.value.trim() : '';
    var topicValue = topic && topic.value ? topic.value : '';
    var messageValue = message && message.value ? message.value.trim() : '';

    if (!nameValue) {
      showError('field-name', '请填写您的称呼');
      ok = false;
    } else if (nameValue.length > 40) {
      showError('field-name', '称呼请控制在 40 个字符以内');
      ok = false;
    } else {
      showError('field-name', '');
    }

    if (!emailValue) {
      showError('field-email', '请填写邮箱');
      ok = false;
    } else if (!EMAIL_RE.test(emailValue)) {
      showError('field-email', '邮箱格式不正确，例如 docs@example.com');
      ok = false;
    } else {
      showError('field-email', '');
    }

    if (!topicValue) {
      showError('field-topic', '请选择一个咨询类型');
      ok = false;
    } else {
      showError('field-topic', '');
    }

    if (messageValue.length < 10) {
      showError('field-message', '内容至少 10 个字符（当前 ' + messageValue.length + ' 个）');
      ok = false;
    } else {
      showError('field-message', '');
    }

    return {
      ok: ok,
      values: {
        name: nameValue,
        email: emailValue,
        topic: topicValue,
        message: messageValue,
      },
    };
  }

  function setFormStatus(form, text, kind) {
    var el = form.querySelector('.form-status');
    if (!el) return;
    el.textContent = text;
    el.className = 'form-status' + (kind ? ' form-status--' + kind : '');
  }

  function onSubmit(event) {
    event.preventDefault();
    var form = event.currentTarget || event.target;
    if (!form || form.nodeName !== 'FORM') return;

    var result = validateContact(form);
    if (!result.ok) {
      setFormStatus(form, '请先修正上面标出的问题。', 'err');
      var firstBad = form.querySelector('[aria-invalid="true"]');
      if (firstBad && typeof firstBad.focus === 'function') firstBad.focus();
      return;
    }

    // 纯前端夹具：不发网络请求，直接给出成功反馈（不可能产生 4xx/5xx）。
    var subject = encodeURIComponent('[Clean Docs] ' + result.values.topic);
    var body = encodeURIComponent(
      '称呼：' + result.values.name + '\n邮箱：' + result.values.email + '\n\n' + result.values.message
    );
    var summary = $('#form-summary');
    if (summary) {
      summary.innerHTML = '';
      var p1 = document.createElement('p');
      p1.textContent = '提交成功（演示模式，未发送任何网络请求）。';
      var p2 = document.createElement('p');
      p2.className = 'muted';
      p2.textContent = '若要真的联系我们，可发送邮件到 docs@example.com。';
      var p3 = document.createElement('p');
      var link = document.createElement('a');
      link.href = 'mailto:docs@example.com?subject=' + subject + '&body=' + body;
      link.textContent = '生成邮件草稿';
      p3.appendChild(link);
      summary.appendChild(p1);
      summary.appendChild(p2);
      summary.appendChild(p3);
    }
    setFormStatus(form, '已收到您的反馈，我们会在 2 个工作日内回复。', 'ok');
  }

  function onReset(event) {
    var form = event.currentTarget;
    if (!form || form.nodeName !== 'FORM') return;
    form.reset();
    ['field-name', 'field-email', 'field-topic', 'field-message'].forEach(function (id) {
      showError(id, '');
    });
    setFormStatus(form, '', '');
    var summary = $('#form-summary');
    if (summary) summary.textContent = '';
  }

  /* -------------------------------------------- 指南页（安全的 DOM 操作）--- */

  function initTabs() {
    var tabs = $$('[data-tab]');
    if (!tabs.length) return;
    tabs.forEach(function (tab) {
      tab.addEventListener('click', function (evt) {
        evt.preventDefault();
        var name = tab.getAttribute('data-tab');
        tabs.forEach(function (other) {
          other.setAttribute('aria-selected', other === tab ? 'true' : 'false');
        });
        $$('[data-tab-panel]').forEach(function (panel) {
          panel.hidden = panel.getAttribute('data-tab-panel') !== name;
        });
      });
    });
  }

  /** 一个可终止、无阻塞的"复制到剪贴板"降级实现。 */
  function initCopyButtons() {
    $$('[data-copy]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var source = document.querySelector(btn.getAttribute('data-copy'));
        var value = source ? source.textContent : '';
        var done = function (label) {
          btn.textContent = label;
          setTimeout(function () {
            btn.textContent = '复制';
          }, 1600);
        };
        if (navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
          navigator.clipboard.writeText(value).then(
            function () {
              done('已复制');
            },
            function () {
              // 权限被拒也会被捕获，绝不产生 unhandledrejection。
              done('复制失败');
            }
          );
        } else {
          done('不支持复制');
        }
      });
    });
  }

  /** 一个简短的、有界的进度动画（rAF，200ms 后自然结束）。 */
  function initProgressDemo() {
    var btn = $('#btn-run-demo');
    var bar = $('#demo-progress');
    if (!btn || !bar) return;
    btn.addEventListener('click', function () {
      var startedAt = performance.now();
      var duration = 200; // 有界：200ms
      bar.value = 0;
      function frame(ts) {
        var ratio = Math.min(1, (ts - startedAt) / duration);
        bar.value = Math.round(ratio * 100);
        if (ratio < 1) {
          requestAnimationFrame(frame);
        }
      }
      requestAnimationFrame(frame);
    });
  }

  /* ------------------------------------------------------------------ boot */

  function boot() {
    var statusPage = $('#service-list') || $('#status-note');
    if (statusPage) {
      loadStatus();
      on(document, 'click', '#btn-refresh-status', function () {
        loadStatus();
      });
    }

    $$('form[data-validate]').forEach(function (form) {
      form.addEventListener('submit', onSubmit);
      // 只在 form 上监听 reset：reset 事件会冒泡（submit 不会），因此不会重复处理。
      form.addEventListener('reset', onReset);
      // 失焦即校验单字段，给用户即时反馈（不阻塞、不抛异常）。
      $$('input, textarea, select').forEach(function (field) {
        if (!field.id) return;
        field.addEventListener('blur', function () {
          field.setAttribute('data-touched', 'true');
          if (field.getAttribute('aria-invalid') === 'true') {
            validateContact(form);
          }
        });
      });
    });

    initTabs();
    initCopyButtons();
    initProgressDemo();

    // 暴露一个只读钩子，方便自动化断言"页面脚本确实初始化成功"。
    window.__cleanSite = {
      version: '1.4.2',
      loadStatus: loadStatus,
      validate: validateContact,
      ready: true,
    };
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();
