/* Ritchie's — simple client-side cart (no backend).
   Cart lives in localStorage so it persists across pages on the site.
   Checkout hands the order summary to the existing Contact page /
   mailto form rather than a live Square transaction. */

(function () {
  var CART_KEY = 'ritchiesCart';

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
        '<div class="cart-line" data-name="' + item.name + '">' +
          '<div class="cart-line-info">' +
            '<span class="cart-line-name">' + item.name + '</span>' +
            '<span class="cart-line-unit">' + formatPrice(item.price) + ' / ' + item.unit + '</span>' +
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
  }

  function buildOrderSummary() {
    var cart = getCart();
    if (cart.length === 0) return '';
    var lines = ['Order summary:', ''];
    cart.forEach(function (item) {
      lines.push('- ' + item.name + ' x' + item.qty + ' (' + formatPrice(item.price) + ' / ' + item.unit + ') = ' + formatPrice(item.price * item.qty));
    });
    lines.push('');
    lines.push('Total: ' + formatPrice(cartTotal(cart)));
    lines.push('');
    lines.push('(Please confirm pickup/delivery details below.)');
    return lines.join('\n');
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

    var toggles = document.querySelectorAll('.cart-toggle');
    var closeBtn = document.getElementById('cart-close');
    var overlay = document.getElementById('cart-overlay');

    toggles.forEach(function (toggle) {
      toggle.addEventListener('click', openCart);
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
  });
})();
