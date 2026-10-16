/* ==========================================================================
   Buggy Shop 演示商城 — 埋点脚本 assets/analytics.js
   纯静态、无外部依赖、无网络请求（只往内存里写）。
   ========================================================================== */
(function () {
  'use strict';

  var queue = [];
  var flushTimer = null;

  function now() {
    return new Date().toISOString();
  }

  function flush() {
    // 演示用：这里不真的上报，只把队列长度写到 window 上供测试断言读取。
    window.__shopAnalytics = {
      flushedAt: now(),
      events: queue.length,
      lastEvent: queue.length ? queue[queue.length - 1] : null,
    };
    queue = [];
    flushTimer = null;
  }

  function track(name, payload) {
    var event = {
      name: String(name || 'unknown'),
      ts: now(),
      payload: payload || {},
    };
    queue.push(event);
    if (flushTimer === null) {
      // 只有异步定时器，绝不死循环；1.2s 后落盘。
      flushTimer = setTimeout(flush, 1200);
    }
    return event;
  }

  function trackClick(target) {
    return track('click', {
      id: target && target.id ? target.id : '',
      tag: target && target.tagName ? target.tagName.toLowerCase() : '',
    });
  }

  function trackView() {
    return track('pageview', { title: document.title, path: location.pathname });
  }

  window.shopAnalytics = {
    track: track,
    trackClick: trackClick,
    trackView: trackView,
    flush: flush,
    /** 演示用：把队列读出来做断言，不产生任何网络流量。 */
    peek: function () {
      return queue.slice();
    },
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', trackView);
  } else {
    trackView();
  }

  // 全局点击埋点：任何按钮点击都会进队列（对爬虫友好，不抛异常）。
  document.addEventListener(
    'click',
    function (event) {
      trackClick(event.target);
    },
    true
  );
})();
