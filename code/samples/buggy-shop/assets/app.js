/* ==========================================================================
   Buggy Shop 演示商城 — 主脚本 assets/app.js
   普通 <script>（非 module），ES5/ES2015 兼容写法，无构建步骤、无外部 CDN。
   这个文件刻意包含多个缺陷，每个缺陷都有 "BUG #n" 注释标记。
   ========================================================================== */
(function () {
  'use strict';

  /* ------------------------------------------------------------------ utils */

  function $(selector) {
    return document.querySelector(selector);
  }

  function onClick(selector, handler) {
    var el = $(selector);
    if (!el) return null;
    el.addEventListener('click', handler);
    return el;
  }

  function text(selector, value) {
    var el = $(selector);
    if (el) el.textContent = String(value);
    return el;
  }

  function formatPrice(cents) {
    return '¥' + (cents / 100).toFixed(2);
  }

  function fakeLatency(ms) {
    return new Promise(function (resolve) {
      setTimeout(resolve, ms);
    });
  }

  /* --------------------------------------------------------------- BUG #4 ---
     BUG #4 http-error —— 两个后端接口在静态服务器上并不存在：
       GET  /api/orders  -> 404 (fetch)
       GET  /api/stock   -> 404 (XMLHttpRequest)
     关键点：响应必须被"观察到"，不能被吞掉。
       * 这里不使用 fetch(url, { mode: 'no-cors' })（那会得到 opaque 响应，看不到 404）；
       * 这里也不依赖 .catch() 的返回值 —— 失败状态码是正常 resolve 的，
         我们读取 res.status / xhr.status 并原样打到控制台。
     为了方便检测器命中，两个接口都由按钮显式触发（见 cart.html 的 #btn-checkout），
     页面加载时不会自动发请求。
     ------------------------------------------------------------------------ */

  function apiFetchOrders() {
    // BUG #4 http-error: /api/orders 不存在，静态服务器返回 404。
    return fetch('/api/orders', {
      method: 'GET',
      headers: { Accept: 'application/json' },
      cache: 'no-store',
    }).then(function (res) {
      // BUG #4: 明确把状态码暴露出来（不吞错误），404 会进入 else 分支并被打印。
      if (!res.ok) {
        console.warn('[api] /api/orders 返回异常状态', res.status, res.statusText);
      }
      return res.text().then(function (body) {
        return {
          url: '/api/orders',
          status: res.status,
          ok: res.ok,
          body: body,
        };
      });
    });
  }

  function apiXhrStock() {
    // BUG #4 http-error: /api/stock 不存在，XHR 会拿到 404。
    return new Promise(function (resolve) {
      var xhr = new XMLHttpRequest();
      xhr.open('GET', '/api/stock', true);
      xhr.setRequestHeader('Accept', 'application/json');
      xhr.onreadystatechange = function () {
        if (xhr.readyState !== 4) return;
        // BUG #4: 保留 404 作为一次真实网络响应的证据，交给监听器/控制台。
        resolve({
          url: '/api/stock',
          status: xhr.status,
          ok: xhr.status >= 200 && xhr.status < 300,
          body: xhr.responseText,
        });
      };
      // 网络层失败时也要 resolve，绝不让 Promise 悬挂。
      xhr.onerror = function () {
        resolve({ url: '/api/stock', status: 0, ok: false, body: '' });
      };
      xhr.send(null);
    });
  }

  /** 触发两个必定 404 的接口，并把原始状态写回页面。 */
  function loadOrderAndStock() {
    return Promise.all([apiFetchOrders(), apiXhrStock()]).then(function (pair) {
      var orders = pair[0];
      var stock = pair[1];
      var el = $('#api-status');
      if (el) {
        el.textContent =
          '/api/orders -> HTTP ' +
          orders.status +
          ' ｜ /api/stock -> HTTP ' +
          stock.status +
          '（接口未实现，属预期缺陷）';
      }
      return pair;
    });
  }

  /* --------------------------------------------------------------- BUG #1 ---
     BUG #1 js-exception —— 立即购买按钮。
     renderOrderConfirm(null, ...) 会读取 null.delivery 的属性，抛出
     TypeError: Cannot read properties of null (reading 'delivery')。
     整条调用链没有任何 try/catch，所以异常会冒泡到 window.onerror /
     Playwright 的 pageerror。这是"点击 #btn-buy-now 就崩"的可复现缺陷。
     ------------------------------------------------------------------------ */

  function renderOrderConfirm(user, product) {
    var box = $('#order-confirm');
    if (!box) return;
    // BUG #1: user 在未登录分支下是 null，这里直接解引用 -> 未捕获 TypeError。
    var address = user.delivery.address;
    box.innerHTML =
      '<p>收货人：' +
      address.name +
      '</p><p>商品：' +
      product.title +
      '</p><p>应付：' +
      formatPrice(product.priceCents) +
      '</p>';
    box.hidden = false;
  }

  function onBuyNow() {
    // BUG #1: 未登录用户返回 null（真实项目里应由登录态接口返回）。
    var currentUser = null;
    var product = { title: '机械键盘 K87', priceCents: 32900 };
    // BUG #1: 下面这一行抛出未捕获异常，故意不包 try/catch。
    renderOrderConfirm(currentUser, product);
    // 正常情况下这里还会跳转结算页；异常导致后续代码永远不会执行。
    window.location.href = '/cart.html';
  }

  /* --------------------------------------------------------------- BUG #2 ---
     BUG #2 unhandled-rejection —— 加入购物车按钮。
     Promise.reject(...) 链上没有任何 .catch()，浏览器会派发
     unhandledrejection 事件（Node/部分环境需 --unhandled-rejections=strict，
     但浏览器原生 alert 一定会有）。
     ------------------------------------------------------------------------ */

  function addToCartRequest(sku, qty) {
    // BUG #2: 服务端返回"库存不足"的失败 Promise，调用方忘了 catch。
    return Promise.reject(
      new Error('ADD_TO_CART_FAILED: 库存服务不可用（sku=' + sku + ', qty=' + qty + '）')
    );
  }

  async function onAddToCart() {
    var el = $('#cart-hint');
    if (el) el.textContent = '正在加入购物车…';
    // BUG #2: await 一个已 reject 的 Promise，且函数调用方没有 .catch()，
    //         于是产生 unhandledrejection。故意不写 try/catch。
    var result = await addToCartRequest('SKU-K87-BLK', 1);
    // 正常路径（永远不会走到）：
    if (el) el.textContent = '已加入购物车：' + result.sku;
  }

  /* --------------------------------------------------------- BUG #3/#8/#7 ---
     BUG #3 console-error / console-warn —— 结算按钮。
     BUG #8 security —— 控制台打印伪造的 JWT（敏感信息泄露）。
     BUG #7 unresponsive —— 计算按钮（见 cart.html #btn-compute）。
     ------------------------------------------------------------------------ */
  function onSubmitOrder() {
    // BUG #8 security: 把内部 token 打进控制台（敏感数据泄露给任何能读 console 的人）。
    console.warn(
      'token=',
      'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMDA4NiIsInNjb3BlIjoib3JkZXI6d3JpdGUiLCJpYXQiOjE3MDAwMDAwMDB9.ZnFrZS1zaWduYXR1cmUtZm9yLXNlbGYtdGVzdA'
    );
    // BUG #8 security: 顺手把接口密钥也漏出来（命中敏感信息规则的另一条特征串）。    console.warn('DEBUG apiKey=sk_live_5f3a9c1d2b7e4a6f8c0d', 'env=staging');

    var failed = true; // 演示用：订单网关在处理这一步之前就挂了
    if (failed) {
      // BUG #3 console-error: 业务明确报错。
      console.error(
        '订单提交失败: 订单网关超时 (orderId=ORD-20261016-0001, gateway=/api/orders)'
      );
      console.warn('订单提交失败: 正在降级为离线草稿模式（数据未同步）');
      text('#checkout-hint', '提交失败，请稍后重试（详情见控制台）');
      return;
    }
    text('#checkout-hint', '下单成功');
  }

  function onCheckout() {
    // 先打日志（BUG #3 / BUG #8），再打两个必定 404 的接口（BUG #4）。
    onSubmitOrder();
    loadOrderAndStock().then(function () {
      // 不吞错误：状态码已经写进页面文本了。
    });
  }

  /* --------------------------------------------------------------- BUG #7 ---
     BUG #7 unresponsive（有界）—— #btn-compute。
     目标：让主线程真实卡住约 2.5 秒，但必须自己结束。
     实现：把全程拆成「有界分片异步阶段」+「一次 2.5s 的阻塞忙循环」。
     最后那次忙循环就是检测器要抓的长任务：它同步占满主线程，
     期间点击/输入/渲染全部冻结，2.5s 后循环条件自然为假，函数返回，页面恢复。
     这里没有任何无限循环（不存在 while(true) / for(;;)）。
     ------------------------------------------------------------------------ */

  function computeChunked() {
    // 有界分片：可选，用来验证"长任务"与"完全卡死"的区别。绝不会死循环。
    var chunkMs = 50;
    var spent = 0;
    return new Promise(function (resolve) {
      function step() {
        if (spent >= 120) {
          resolve(spent);
          return;
        }
        var t0 = Date.now();
        while (Date.now() - t0 < chunkMs) {
          /* 有界的 50ms 忙等，验证分片长任务上报 */
        }
        spent += chunkMs;
        setTimeout(step, 0);
      }
      step();
    });
  }

  function blockingBusyLoop(ms) {
    // BUG #7 unresponsive: 有界阻塞忙循环，约 ms 毫秒后必然退出。
    var startedAt = Date.now();
    var iterations = 0;
    while (Date.now() - startedAt < ms) {
      iterations += 1;
    }
    return { elapsedMs: Date.now() - startedAt, iterations: iterations };
  }

  function onCompute() {
    var btn = $('#btn-compute');
    if (btn) {
      btn.disabled = true;
      btn.textContent = '计算中…（主线程阻塞 2.5s）';
    }
    text('#compute-result', '计算中…');
    computeChunked().then(function () {
      // BUG #7: 这一行会让浏览器单线程冻结约 2500ms（绝不无限循环）。
      var stat = blockingBusyLoop(2500);
      var measured = Math.round(performance.now());
      text(
        '#compute-result',
        '阻塞结束：' + stat.elapsedMs + 'ms 实测耗时（' + stat.iterations + ' 次迭代），页面时间轴 ' + measured + 'ms'
      );
      if (btn) {
        btn.disabled = false;
        btn.textContent = '重新计算（阻塞 2.5s）';
      }
    });
  }

  /* ------------------------------------------------------------------ wiring */

  function boot() {
    // index.html —— BUG #1
    onClick('#btn-buy-now', onBuyNow);
    // product.html —— BUG #2
    onClick('#btn-add-cart', onAddToCart);
    // cart.html —— BUG #3 + #4 + #8
    onClick('#btn-checkout', onCheckout);
    // cart.html —— BUG #7（有界阻塞 2.5s）
    onClick('#btn-compute', onCompute);

    // 数量选择器：正常逻辑，供爬虫做 select 交互（这一段没有缺陷）。
    var qty = $('#qty');
    var qtyLabel = $('#qty-label');
    if (qty) {
      qty.addEventListener('change', function () {
        var price = 32900;
        var n = parseInt(qty.value, 10);
        if (isNaN(n) || n < 1) n = 1;
        text('#line-total', formatPrice(price * n));
        text('#cart-total', formatPrice(price * n));
        if (qtyLabel) qtyLabel.textContent = String(n);
      });
    }

    // 暴露给自动化测试使用的钩子（只读，不产生副作用）。
    window.__shop = {
      apiFetchOrders: apiFetchOrders,
      apiXhrStock: apiXhrStock,
      loadOrderAndStock: loadOrderAndStock,
      version: '1.0.0-buggy',
    };
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }

  // 注意：本文件是全站共用的，未被引用的页面元素会在 onClick/text 里自动跳过。
  void fakeLatency;
})();
