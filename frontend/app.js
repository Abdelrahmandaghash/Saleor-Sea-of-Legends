const productContainer = document.getElementById('products-grid');
const cartCount = document.getElementById('cart-count');
const cartDialog = document.getElementById('cart-dialog');
const cartContent = document.getElementById('cart-content');
const cartFooter = document.getElementById('cart-footer');
const checkoutDialog = document.getElementById('checkout-dialog');
const checkoutForm = document.getElementById('checkout-form');
const checkoutError = document.getElementById('checkout-error');
const toast = document.getElementById('toast');
const searchInput = document.getElementById('product-search');
const resultCount = document.getElementById('product-result-count');
const statusMessage = document.getElementById('status-message');
const doubloonCount = document.getElementById('doubloon-count');

const cardLevelsKey = 'saleor-card-levels';
const doubloonsKey = 'saleor-doubloons';
let doubloons = Math.max(0, Number(localStorage.getItem(doubloonsKey)) || 0);
let cardLevels = {};
try {
  cardLevels = JSON.parse(localStorage.getItem(cardLevelsKey) || '{}') || {};
} catch {
  cardLevels = {};
}

let cartId = localStorage.getItem('saleor-cart-id');
if (!cartId) {
  cartId = crypto.randomUUID();
  localStorage.setItem('saleor-cart-id', cartId);
}

let products = [];
let cart = { items: [], item_count: 0, subtotal: 0 };
let activeCategory = 'All';
let toastTimer;

function formatPrice(price) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(price);
}

function getCardLevel(productId) {
  return Math.min(10, Math.max(1, Number(cardLevels[productId]) || 1));
}

function getUpgradeCost(level) {
  return level * 25;
}

function saveProgress() {
  localStorage.setItem(doubloonsKey, String(doubloons));
  localStorage.setItem(cardLevelsKey, JSON.stringify(cardLevels));
}

function updateWallet() {
  doubloonCount.textContent = String(doubloons);
  doubloonCount.parentElement.setAttribute('aria-label', `${doubloons} doubloons`);
}

updateWallet();

function showToast(message) {
  toast.textContent = message;
  toast.classList.add('visible');
  window.clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => toast.classList.remove('visible'), 2600);
}

function showLoadError(message) {
  statusMessage.textContent = message;
  statusMessage.classList.add('visible');
}

function makeImage(product, className = '') {
  const image = document.createElement('img');
  image.src = product.image_url;
  image.alt = product.name;
  image.loading = 'lazy';
  image.className = className;
  image.addEventListener('error', () => image.classList.add('image-unavailable'), { once: true });
  return image;
}

function renderCategoryFilters() {
  const categories = ['All', ...new Set(products.map((product) => product.category))];
  const categoryList = document.getElementById('category-list');
  categoryList.replaceChildren();

  categories.forEach((category) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = `category-button${category === activeCategory ? ' active' : ''}`;
    button.textContent = category;
    button.setAttribute('aria-pressed', String(category === activeCategory));
    button.addEventListener('click', () => {
      activeCategory = category;
      renderCategoryFilters();
      renderProducts();
    });
    categoryList.appendChild(button);
  });
}

function createProductCard(product) {
  const card = document.createElement('article');
  card.className = 'product-card';
  card.dataset.productId = product.id;
  card.dataset.category = product.category.toLocaleLowerCase();
  card.dataset.level = String(getCardLevel(product.id));
  card.tabIndex = -1;

  const visual = document.createElement('div');
  visual.className = 'product-visual';
  visual.appendChild(makeImage(product));

  const tag = document.createElement('span');
  tag.className = 'product-tag';
  tag.textContent = product.badge;
  visual.appendChild(tag);

  const levelChip = document.createElement('span');
  levelChip.className = 'card-level-chip';
  levelChip.textContent = `LVL ${getCardLevel(product.id)}`;
  visual.appendChild(levelChip);

  const addButton = document.createElement('button');
  addButton.type = 'button';
  addButton.className = `quick-add${product.stock === 0 ? ' sold-out' : ''}`;
  addButton.textContent = product.stock === 0 ? 'Sold out' : 'Add to collection  +';
  addButton.disabled = product.stock === 0;
  addButton.addEventListener('click', () => addToCart(product.id));
  visual.appendChild(addButton);
  if (product.stock === 0) {
    const soldOut = document.createElement('span');
    soldOut.className = 'sold-out-stamp';
    soldOut.textContent = 'Sold out';
    visual.appendChild(soldOut);
  }
  card.appendChild(visual);

  const info = document.createElement('div');
  info.className = 'product-info';
  const category = document.createElement('p');
  category.className = 'product-category';
  category.textContent = product.category;
  const titleRow = document.createElement('div');
  titleRow.className = 'product-title-row';
  const title = document.createElement('h3');
  title.textContent = product.name;
  const price = document.createElement('span');
  price.className = 'product-price';
  price.textContent = formatPrice(product.price);
  titleRow.append(title, price);
  const description = document.createElement('p');
  description.className = 'product-description';
  description.textContent = product.description;
  const stock = document.createElement('p');
  stock.className = `product-stock${product.stock === 0 ? ' unavailable' : ''}`;
  stock.textContent = product.stock === 0
    ? 'Manifest: 0 remaining'
    : `Manifest: ${product.stock} ${product.stock === 1 ? 'piece' : 'pieces'} remaining`;
  const stockMeter = document.createElement('div');
  stockMeter.className = `loot-meter${product.stock === 0 ? ' unavailable' : ''}`;
  stockMeter.setAttribute('role', 'meter');
  stockMeter.setAttribute('aria-label', `Stock remaining for ${product.name}`);
  stockMeter.setAttribute('aria-valuemin', '0');
  stockMeter.setAttribute('aria-valuemax', '5');
  stockMeter.setAttribute('aria-valuenow', String(product.stock));
  const stockMeterFill = document.createElement('span');
  stockMeterFill.className = 'loot-meter-fill';
  stockMeterFill.style.width = `${(product.stock / 5) * 100}%`;
  stockMeter.appendChild(stockMeterFill);
  const cardStats = document.createElement('div');
  cardStats.className = 'card-stats';
  [
    { name: 'Power', value: product.power, symbol: '⚔' },
    { name: 'Guard', value: product.guard, symbol: '◈' },
  ].forEach((stat) => {
    const statItem = document.createElement('div');
    statItem.className = 'card-stat';
    const statHeading = document.createElement('div');
    statHeading.className = 'card-stat-heading';
    const statName = document.createElement('span');
    statName.textContent = `${stat.symbol} ${stat.name}`;
    const statValue = document.createElement('strong');
    statValue.textContent = String(stat.value);
    statHeading.append(statName, statValue);
    const statMeter = document.createElement('span');
    statMeter.className = 'card-stat-meter';
    const statFill = document.createElement('i');
    statFill.style.width = `${stat.value}%`;
    statMeter.appendChild(statFill);
    statItem.append(statHeading, statMeter);
    cardStats.appendChild(statItem);
  });

  const level = getCardLevel(product.id);
  const upgradeCost = getUpgradeCost(level);
  const upgradeRow = document.createElement('div');
  upgradeRow.className = 'level-up-row';
  const upgradeButton = document.createElement('button');
  upgradeButton.type = 'button';
  upgradeButton.className = 'level-up-button';
  upgradeButton.textContent = level >= 10 ? 'Max level' : `Upgrade · ${upgradeCost} DBL`;
  upgradeButton.disabled = level >= 10 || doubloons < upgradeCost;
  upgradeButton.setAttribute('aria-label', level >= 10
    ? `${product.name} is max level`
    : `Upgrade ${product.name} to level ${level + 1} for ${upgradeCost} doubloons`);
  upgradeButton.addEventListener('click', () => levelUpCard(product.id));
  const upgradeHint = document.createElement('span');
  upgradeHint.className = 'upgrade-hint';
  upgradeHint.textContent = level >= 10 ? 'MAX' : `${doubloons} DBL`;
  upgradeRow.append(upgradeButton, upgradeHint);

  info.append(category, titleRow, description, cardStats, stock, stockMeter, upgradeRow);
  card.appendChild(info);
  return card;
}

function levelUpCard(productId) {
  const product = products.find((entry) => entry.id === productId);
  if (!product) return;

  const currentLevel = getCardLevel(productId);
  const cost = getUpgradeCost(currentLevel);
  if (currentLevel >= 10) {
    showToast(`${product.name} has reached max level.`);
    return;
  }
  if (doubloons < cost) {
    showToast(`Earn ${cost - doubloons} more doubloons to level up.`);
    return;
  }

  doubloons -= cost;
  cardLevels[productId] = currentLevel + 1;
  saveProgress();
  updateWallet();
  renderProducts();
  const upgradedCard = productContainer.querySelector(`[data-product-id="${productId}"]`);
  upgradedCard?.classList.add('level-up-flash');
  upgradedCard?.querySelector('.level-up-button')?.focus({ preventScroll: true });
  window.setTimeout(() => upgradedCard?.classList.remove('level-up-flash'), 900);
  showToast(`${product.name} reached level ${currentLevel + 1}!`);
}

function renderProducts() {
  const query = searchInput.value.trim().toLocaleLowerCase();
  const visibleProducts = products.filter((product) => {
    const matchesCategory = activeCategory === 'All' || product.category === activeCategory;
    const matchesQuery = `${product.name} ${product.description} ${product.category}`.toLocaleLowerCase().includes(query);
    return matchesCategory && matchesQuery;
  });

  productContainer.replaceChildren();
  resultCount.textContent = `${visibleProducts.length} ${visibleProducts.length === 1 ? 'find' : 'finds'}`;
  if (visibleProducts.length === 0) {
    const empty = document.createElement('p');
    empty.className = 'empty-products';
    empty.textContent = 'No treasure found. Try another search or category.';
    productContainer.appendChild(empty);
    return;
  }
  visibleProducts.forEach((product) => productContainer.appendChild(createProductCard(product)));
}

function findRandomRelic() {
  const availableProducts = products.filter((product) => product.stock > 0);
  if (availableProducts.length === 0) {
    showToast('The hold is empty. Check back after the next tide.');
    return;
  }

  const product = availableProducts[Math.floor(Math.random() * availableProducts.length)];
  searchInput.value = '';
  activeCategory = 'All';
  renderCategoryFilters();
  renderProducts();

  const card = Array.from(productContainer.querySelectorAll('.product-card'))
    .find((productCard) => productCard.dataset.productId === product.id);
  if (!card) return;

  card.scrollIntoView({ behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'center' });
  card.focus({ preventScroll: true });
  card.classList.add('relic-found');
  window.setTimeout(() => card.classList.remove('relic-found'), 3300);
  showToast(`The compass points to ${product.name}.`);
}

function updateCartBadge() {
  cartCount.textContent = String(cart.item_count);
  updateWallet();
  document.getElementById('open-cart').setAttribute('aria-label', `Open treasure chest, ${cart.item_count} items`);
  document.getElementById('cart-title-count').textContent = `(${cart.item_count})`;
}

function renderCart() {
  updateCartBadge();
  cartContent.replaceChildren();
  cartFooter.replaceChildren();

  if (cart.items.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'cart-empty';
    const icon = document.createElement('span');
    icon.className = 'empty-hold-icon';
    icon.setAttribute('aria-hidden', 'true');
    icon.textContent = '☠';
    const heading = document.createElement('h3');
    heading.textContent = 'Your hold is empty';
    const message = document.createElement('p');
    message.textContent = 'A captain needs a crew. Find your first card in the harbor.';
    const shopButton = document.createElement('button');
    shopButton.type = 'button';
    shopButton.textContent = 'Explore the harbor';
    shopButton.addEventListener('click', () => cartDialog.close());
    empty.append(icon, heading, message, shopButton);
    cartContent.appendChild(empty);
    return;
  }

  cart.items.forEach((item) => {
    const row = document.createElement('article');
    row.className = 'cart-item';
    row.appendChild(makeImage(item));

    const copy = document.createElement('div');
    copy.className = 'cart-item-copy';
    const title = document.createElement('h3');
    title.textContent = item.name;
    const price = document.createElement('span');
    price.textContent = formatPrice(item.price);
    const quantityControl = document.createElement('div');
    quantityControl.className = 'quantity-control';

    const decrease = document.createElement('button');
    decrease.type = 'button';
    decrease.textContent = '−';
    decrease.setAttribute('aria-label', `Remove one ${item.name}`);
    decrease.addEventListener('click', () => changeCart(item.id, -1));
    const quantity = document.createElement('span');
    quantity.textContent = String(item.quantity);
    const increase = document.createElement('button');
    increase.type = 'button';
    increase.textContent = '+';
    increase.setAttribute('aria-label', `Add one ${item.name}`);
    increase.disabled = item.quantity >= Math.min(item.stock, 5);
    increase.addEventListener('click', () => changeCart(item.id, 1));
    quantityControl.append(decrease, quantity, increase);
    copy.append(title, price, quantityControl);

    const side = document.createElement('div');
    side.className = 'cart-item-side';
    const lineTotal = document.createElement('strong');
    lineTotal.textContent = formatPrice(item.price * item.quantity);
    const remove = document.createElement('button');
    remove.type = 'button';
    remove.className = 'remove-item';
    remove.textContent = 'Remove';
    remove.addEventListener('click', () => changeCart(item.id, 0));
    side.append(lineTotal, remove);
    row.append(copy, side);
    cartContent.appendChild(row);
  });

  const summary = document.createElement('div');
  summary.className = 'cart-summary-row';
  const subtotalLabel = document.createElement('span');
  subtotalLabel.textContent = 'Subtotal';
  const subtotal = document.createElement('span');
  subtotal.textContent = formatPrice(cart.subtotal);
  summary.append(subtotalLabel, subtotal);

  const shipping = document.createElement('p');
  shipping.className = 'cart-shipping-note';
  shipping.textContent = `Demo checkout earns ${cart.item_count * 25} doubloons for card upgrades.`;
  const checkout = document.createElement('button');
  checkout.type = 'button';
  checkout.className = 'checkout-button';
  checkout.textContent = 'Continue to checkout';
  checkout.addEventListener('click', () => {
    checkoutError.textContent = '';
    cartDialog.close();
    checkoutDialog.showModal();
  });
  const disclaimer = document.createElement('p');
  disclaimer.className = 'checkout-disclaimer';
  disclaimer.textContent = 'Demo checkout · No payment is collected';
  cartFooter.append(summary, shipping, checkout, disclaimer);
}

async function changeCart(productId, quantityChange) {
  try {
    const item = cart.items.find((cartItem) => cartItem.id === productId);
    const quantity = quantityChange === 0 ? 0 : (item?.quantity || 0) + quantityChange;
    const response = await fetch(`/api/cart/${encodeURIComponent(productId)}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', 'X-Cart-ID': cartId },
      body: JSON.stringify({ quantity }),
    });
    const result = await response.json();
    if (!response.ok) {
      throw new Error(result.error || 'Unable to update your chest.');
    }
    cart = result;
    renderCart();
    showToast(quantityChange === 0 ? 'Removed from your chest.' : quantityChange > 0 ? 'Added to your collection.' : 'Chest updated.');
  } catch (error) {
    showToast(error.message || 'Could not update your chest. Please try again.');
  }
}

async function addToCart(productId) {
  try {
    const response = await fetch('/api/cart', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Cart-ID': cartId },
      body: JSON.stringify({ product_id: productId, quantity: 1 }),
    });
    const result = await response.json();
    if (!response.ok) {
      throw new Error(result.error || 'Unable to stow this item.');
    }
    cart = result;
    renderCart();
    showToast('Added to your collection.');
  } catch (error) {
    showToast(error.message || 'Could not update your chest. Please try again.');
  }
}

async function loadStore() {
  try {
    const [productsResponse, cartResponse] = await Promise.all([
      fetch('/api/products'),
      fetch('/api/cart', { headers: { 'X-Cart-ID': cartId } }),
    ]);
    if (!productsResponse.ok || !cartResponse.ok) {
      throw new Error('The shop is temporarily unavailable.');
    }
    products = await productsResponse.json();
    cart = await cartResponse.json();
    renderCategoryFilters();
    renderProducts();
    renderCart();
  } catch (error) {
    showLoadError('We couldn’t load the shop just now. Please refresh in a moment.');
  }
}

document.getElementById('open-cart').addEventListener('click', () => cartDialog.showModal());
document.getElementById('find-relic').addEventListener('click', findRandomRelic);
document.getElementById('close-cart').addEventListener('click', () => cartDialog.close());
document.getElementById('close-checkout').addEventListener('click', () => checkoutDialog.close());
cartDialog.addEventListener('click', (event) => {
  if (event.target === cartDialog) {
    cartDialog.close();
  }
});
checkoutDialog.addEventListener('click', (event) => {
  if (event.target === checkoutDialog) {
    checkoutDialog.close();
  }
});
checkoutForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  checkoutError.textContent = '';
  const placeOrderButton = document.getElementById('place-order');
  placeOrderButton.disabled = true;
  placeOrderButton.textContent = 'Charting your order…';
  try {
    const formData = new FormData(checkoutForm);
    const response = await fetch('/api/orders', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Cart-ID': cartId },
      body: JSON.stringify({
        name: formData.get('name'),
        email: formData.get('email'),
        address: formData.get('address'),
      }),
    });
    const result = await response.json();
    if (!response.ok) {
      throw new Error(result.error || 'Unable to place your demo order.');
    }
    const earnedDoubloons = cart.item_count * 25;
    doubloons += earnedDoubloons;
    saveProgress();
    updateWallet();
    cart = { items: [], item_count: 0, subtotal: 0 };
    products = result.products;
    renderProducts();
    renderCart();
    checkoutDialog.close();
    checkoutForm.reset();
    showToast(`Order #${result.order_id} placed · +${earnedDoubloons} doubloons · ${formatPrice(result.total)}.`);
  } catch (error) {
    checkoutError.textContent = error.message || 'Could not place your demo order. Please try again.';
  } finally {
    placeOrderButton.disabled = false;
    placeOrderButton.textContent = 'Place demo order';
  }
});
searchInput.addEventListener('input', renderProducts);
document.querySelectorAll('[data-nav-category]').forEach((link) => {
  link.addEventListener('click', () => {
    activeCategory = link.dataset.navCategory;
    renderCategoryFilters();
    renderProducts();
  });
});
document.querySelectorAll('[data-harbor-category]').forEach((marker) => {
  marker.addEventListener('click', () => {
    activeCategory = marker.dataset.harborCategory;
    renderCategoryFilters();
    renderProducts();
    const scrollBehavior = window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth';
    document.getElementById('products').scrollIntoView({ behavior: scrollBehavior, block: 'start' });
  });
});

loadStore();
