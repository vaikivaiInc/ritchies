/* Ritchie's — client-side cart + inline checkout (no backend server of our
   own). Cart lives in localStorage so it persists across pages on the site.
   Checkout happens right inside the cart drawer and submits directly to the
   Google Apps Script order-collection endpoint — no email app, no separate
   page to navigate to. */

(function () {
  var CART_KEY = 'ritchiesCart';

  // Same endpoint the Contact page's general-inquiry form submits to.
  var ORDER_ENDPOINT = 'https://script.google.com/macros/s/AKfycbz4ivJ5fnwD7FdWJuObNuY6VauR4CdlzBiszziN28Gz7bcbU-8wFdBA_KWrdfTC1etcVA/exec';

  function getCart() {
    try {
      return JSON.parse(localStorage.getItem(CART_KEY)) || [];
    } catch (e) {
      return [];
    }
  }

  function saveCart(cart) {
    localStorage.setItem(CART_KEY, JSON.stringify(cart));
  }

  function formatPrice(n) {
    return '$' + n.toFixed(2);
  }

  function escapeHtml(str) {
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function findItem(cart, name) {
    for (var i = 0; i < cart.length; i++) {
      if (cart[i].name === name) return cart[i];
    }
    return null;
  }

  function addToCart(name, price, unit, qty) {
    qty = qty || 1;
    var cart = getCart();
    var existing = findItem(cart, name);
    if (existing) {
      existing.qty += qty;
    } else {
      cart.push({ name: name, price: price, unit: unit, qty: qty });
    }
    saveCart(cart);
    renderCartBadge();
    renderCartDrawer();
    showCartView();
    openCart();
  }

  function removeFromCart(name) {
    var cart = getCart().filter(function (i) { return i.name !== name; });
    saveCart(cart);
    renderCartBadge();
    renderCartDrawer();
  }

  function changeQty(name, delta) {
    var cart = getCart();
    var item = findItem(cart, name);
    if (!item) return;
    item.qty += delta;
    if (item.qty <= 0) {
      cart = cart.filter(function (i) { return i.name !== name; });
    }
    saveCart(cart);
    renderCartBadge();
    renderCartDrawer();
  }

  function cartTotal(cart) {
    return cart.reduce(function (sum, i) { return sum + i.price * i.qty; }, 0);
  }

  function renderCartBadge() {
    var countEls = document.querySelectorAll('.cart-count');
    if (!countEls.length) return;
    var cart = getCart();
    var count = cart.reduce(function (sum, i) { return sum + i.qty; }, 0);
    countEls.forEach(function (countEl) {
      countEl.textContent = count;
      countEl.style.display = count > 0 ? 'flex' : 'none';
    });
  }

  function renderCartDrawer() {
    var itemsEl = document.getElementById('cart-items');
    var totalEl = document.getElementById('cart-total');
    if (!itemsEl || !totalEl) return;

    var cart = getCart();

    if (cart.length === 0) {
      itemsEl.innerHTML = '<p class="cart-empty">Your cart is empty.</p>';
      totalEl.textContent = formatPrice(0);
      return;
    }

    var html = '';
    cart.forEach(function (item) {
      html +=
        '<div class="cart-line" data-name="' + escapeHtml(item.name) + '">' +
          '<div class="cart-line-info">' +
            '<span class="cart-line-name">' + escapeHtml(item.name) + '</span>' +
            '<span class="cart-line-unit">' + formatPrice(item.price) + ' / ' + escapeHtml(item.unit) + '</span>' +
          '</div>' +
          '<div class="cart-line-controls">' +
            '<button type="button" class="cart-qty-btn" data-action="minus">&minus;</button>' +
            '<span class="cart-qty-value">' + item.qty + '</span>' +
            '<button type="button" class="cart-qty-btn" data-action="plus">+</button>' +
            '<button type="button" class="cart-remove-btn" data-action="remove" aria-label="Remove item">&times;</button>' +
          '</div>' +
          '<span class="cart-line-subtotal">' + formatPrice(item.price * item.qty) + '</span>' +
        '</div>';
    });

    itemsEl.innerHTML = html;
    totalEl.textContent = formatPrice(cartTotal(cart));

    itemsEl.querySelectorAll('.cart-line').forEach(function (line) {
      var name = line.getAttribute('data-name');
      line.querySelector('[data-action="minus"]').addEventListener('click', function () {
        changeQty(name, -1);
      });
      line.querySelector('[data-action="plus"]').addEventListener('click', function () {
        changeQty(name, 1);
      });
      line.querySelector('[data-action="remove"]').addEventListener('click', function () {
        removeFromCart(name);
      });
    });
  }

  // ---- Checkout order review (read-only) ----

  function renderCheckoutSummary() {
    var el = document.getElementById('checkout-order-summary');
    if (!el) return;
    var cart = getCart();
    var html = '';
    cart.forEach(function (item) {
      html +=
        '<div class="checkout-summary-line">' +
          '<span>' + escapeHtml(item.name) + ' &times;' + item.qty + '</span>' +
          '<span>' + formatPrice(item.price * item.qty) + '</span>' +
        '</div>';
    });
    html +=
      '<div class="checkout-summary-total">' +
        '<span>Total</span><span>' + formatPrice(cartTotal(cart)) + '</span>' +
      '</div>';
    el.innerHTML = html;
  }

  function buildOrderSummary() {
    var cart = getCart();
    if (cart.length === 0) return '';
    var lines = [];
    cart.forEach(function (item) {
      lines.push('- ' + item.name + ' x' + item.qty + ' (' + formatPrice(item.price) + ' / ' + item.unit + ') = ' + formatPrice(item.price * item.qty));
    });
    lines.push('');
    lines.push('Total: ' + formatPrice(cartTotal(cart)));
    return lines.join('\n');
  }

  // ---- Drawer view switching: cart / checkout form / success ----

  function showCartView() {
    setViews('cart', 'Your Order');
  }

  function showCheckoutView() {
    if (getCart().length === 0) return; // nothing to check out
    renderCheckoutSummary();
    setViews('checkout', 'Checkout');
  }

  function showSuccessView() {
    setViews('success', 'Order Placed');
  }

  function setViews(which, title) {
    var cartView = document.getElementById('cart-view');
    var checkoutView = document.getElementById('checkout-view');
    var successView = document.getElementById('checkout-success-view');
    var titleEl = document.getElementById('cart-drawer-title');
    if (cartView) cartView.style.display = which === 'cart' ? 'block' : 'none';
    if (checkoutView) checkoutView.style.display = which === 'checkout' ? 'block' : 'none';
    if (successView) successView.style.display = which === 'success' ? 'block' : 'none';
    if (titleEl) titleEl.textContent = title;
  }

  function openCart() {
    var drawer = document.getElementById('cart-drawer');
    var overlay = document.getElementById('cart-overlay');
    if (drawer) drawer.classList.add('open');
    if (overlay) overlay.classList.add('open');
  }

  function closeCart() {
    var drawer = document.getElementById('cart-drawer');
    var overlay = document.getElementById('cart-overlay');
    if (drawer) drawer.classList.remove('open');
    if (overlay) overlay.classList.remove('open');
    // Reset to the default cart view for the next time the drawer opens.
    showCartView();
  }

  // Expose what individual pages need to wire up buttons.
  window.RitchiesCart = {
    addToCart: addToCart,
    getCart: getCart,
    cartTotal: cartTotal,
    formatPrice: formatPrice,
    buildOrderSummary: buildOrderSummary,
    clearCart: function () {
      saveCart([]);
      renderCartBadge();
      renderCartDrawer();
    },
    openCart: openCart,
    closeCart: closeCart
  };

  document.addEventListener('DOMContentLoaded', function () {
    renderCartBadge();
    renderCartDrawer();
    showCartView();

    var toggles = document.querySelectorAll('.cart-toggle');
    var closeBtn = document.getElementById('cart-close');
    var overlay = document.getElementById('cart-overlay');

    toggles.forEach(function (toggle) {
      toggle.addEventListener('click', function () {
        showCartView();
        openCart();
      });
    });
    if (closeBtn) closeBtn.addEventListener('click', closeCart);
    if (overlay) overlay.addEventListener('click', closeCart);

    // Wire up every "Add to Cart" button on the page.
    document.querySelectorAll('.add-to-cart-btn').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var item = btn.closest('[data-product-name]');
        if (!item) return;
        var name = item.getAttribute('data-product-name');
        var price = parseFloat(item.getAttribute('data-product-price'));
        var unit = item.getAttribute('data-product-unit');
        var qtyInput = item.querySelector('.qty-input');
        var qty = qtyInput ? parseInt(qtyInput.value, 10) || 1 : 1;
        addToCart(name, price, unit, qty);
        if (qtyInput) qtyInput.value = 1;
      });
    });

    // Wire up the small quantity steppers next to each item (not the cart drawer's).
    document.querySelectorAll('.qty-stepper').forEach(function (stepper) {
      var input = stepper.querySelector('.qty-input');
      var minus = stepper.querySelector('.qty-minus');
      var plus = stepper.querySelector('.qty-plus');
      if (minus) minus.addEventListener('click', function () {
        input.value = Math.max(1, (parseInt(input.value, 10) || 1) - 1);
      });
      if (plus) plus.addEventListener('click', function () {
        input.value = (parseInt(input.value, 10) || 1) + 1;
      });
    });

    // ---- Inline checkout: cart -> checkout form -> success, all in the drawer ----

    var checkoutBtn = document.getElementById('cart-checkout');
    var checkoutBack = document.getElementById('checkout-back');
    var checkoutForm = document.getElementById('checkout-form');
    var checkoutSubmitBtn = document.getElementById('checkout-submit-btn');
    var checkoutErrorEl = document.getElementById('checkout-error');

    if (checkoutBtn) {
      checkoutBtn.addEventListener('click', showCheckoutView);
    }
    if (checkoutBack) {
      checkoutBack.addEventListener('click', showCartView);
    }

    if (checkoutForm) {
      checkoutForm.addEventListener('submit', function (event) {
        event.preventDefault();
        if (getCart().length === 0) return;
        if (checkoutErrorEl) checkoutErrorEl.style.display = 'none';

        var payload = {};
        new FormData(checkoutForm).forEach(function (value, key) {
          payload[key] = value;
        });
        payload.OrderSummary = buildOrderSummary();
        payload.Total = formatPrice(cartTotal(getCart()));

        if (checkoutSubmitBtn) {
          checkoutSubmitBtn.disabled = true;
          checkoutSubmitBtn.textContent = 'PLACING ORDER…';
        }

        // No explicit Content-Type header — keeps this a CORS "simple
        // request" (avoids a preflight OPTIONS call), which Google Apps
        // Script Web Apps don't handle.
        fetch(ORDER_ENDPOINT, {
          method: 'POST',
          body: JSON.stringify(payload)
        })
          .then(function (res) { return res.json(); })
          .then(function (result) {
            if (!result || result.result !== 'success') {
              throw new Error((result && result.message) || 'Request failed');
            }
            saveCart([]);
            renderCartBadge();
            renderCartDrawer();
            checkoutForm.reset();
            showSuccessView();
          })
          .catch(function () {
            if (checkoutSubmitBtn) {
              checkoutSubmitBtn.disabled = false;
              checkoutSubmitBtn.textContent = 'PLACE ORDER';
            }
            if (checkoutErrorEl) checkoutErrorEl.style.display = 'block';
          });
      });
    }
  });
})();
