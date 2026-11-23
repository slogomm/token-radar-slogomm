// Token Radar's plain dashboard. It reads window.RADAR (written beside dashboard/ by main.ts) and
// renders the ranked board, a filterable table, a per-protocol detail drawer with the model's own
// inputs and the protocol's farm plan. No network: every byte it shows is in data.js.
(function () {
  'use strict';

  var DATA = window.RADAR;
  if (!DATA) return;
  var app = document.getElementById('board');
  var state = { q: '', category: 'all', tab: 'pre-token', sort: 'implied', dir: -1, selected: null };

  var usd = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
  function fmtUsd(n) {
    if (n === null || n === undefined || !isFinite(n)) return 'n/a';
    if (Math.abs(n) >= 1e12) return '$' + (n / 1e12).toFixed(2) + 'T';
    if (Math.abs(n) >= 1e9) return '$' + (n / 1e9).toFixed(2) + 'B';
    if (Math.abs(n) >= 1e6) return '$' + (n / 1e6).toFixed(1) + 'M';
    if (Math.abs(n) >= 1e3) return '$' + Math.round(n / 1e3) + 'K';
    return usd.format(n);
  }
  function fmtPct(n) {
    if (n === null || n === undefined || !isFinite(n)) return 'n/a';
    return (n > 0 ? '+' : '') + n.toFixed(2) + '%';
  }
  function fmtAge(days) {
    if (days === null || days === undefined) return 'unknown';
    if (days >= 365) return (days / 365).toFixed(1) + 'y';
    return Math.max(0, Math.round(days)) + 'd';
  }
  // The model in one function: the page recomputes a row from the snapshot figures and checks the
  // number board.json carries, so the page's code and the board's data are visibly the same arithmetic.
  function impliedOf(row, model) {
    var growth = Math.min(model.growth_cap, Math.max(model.growth_floor, row.change_7d === null || row.change_7d === undefined ? 0 : row.change_7d));
    var growthMult = 1 + (growth / 100) * model.growth_weight;
    var age = row.age_days === null || row.age_days === undefined ? model.unknown_age_days : row.age_days;
    var maturity = model.maturity_floor + (Math.min(Math.max(age, 0), model.maturity_days) / model.maturity_days) * model.maturity_range;
    var categoryWeight = row.category_weight || 1.0;
    var chainBonus = row.chain_bonus || 1.0;
    var tvlMomentum = row.tvl_momentum || 1.0;
    return Math.max(1, Math.round(row.tvl_usd * model.base_multiple * growthMult * maturity * categoryWeight * chainBonus * tvlMomentum));
  }

  function el(tag, attrs) {
    var node = document.createElement(tag);
    if (attrs) {
      Object.keys(attrs).forEach(function (k) {
        if (k === 'class') node.className = attrs[k];
        else if (k === 'text') node.textContent = attrs[k];
        else if (k === 'html') node.innerHTML = attrs[k];
        else if (k.slice(0, 2) === 'on') node.addEventListener(k.slice(2), attrs[k]);
        else if (attrs[k] !== null && attrs[k] !== undefined) node.setAttribute(k, attrs[k]);
      });
    }
    for (var i = 2; i < arguments.length; i++) {
      var child = arguments[i];
      if (child === null || child === undefined) continue;
      if (Array.isArray(child)) child.forEach(function (c) { if (c) node.appendChild(c); });
      else if (typeof child === 'string') node.appendChild(document.createTextNode(child));
      else node.appendChild(child);
    }
    return node;
  }

  // The farm plan is the same derivation main.ts writes to board.json: category, chains, TVL and age
  // decide the action, the capital, the hold and every cost and time. No name is special-cased.
  function chainOf(p) { return p.chains && p.chains.length > 0 ? p.chains[0] : 'its main chain'; }
  function capitalFor(p) {
    if (p.tvl_usd >= 5e9) return 250;
    if (p.tvl_usd >= 1e9) return 150;
    if (p.tvl_usd >= 1e8) return 100;
    return 50;
  }
  function holdDaysFor(age) {
    if (age === null || age === undefined) return 30;
    if (age < 180) return 60;
    if (age < 365) return 45;
    return 30;
  }
  function actionFor(p, capital, chain) {
    var c = (p.category || '').toLowerCase();
    var name = p.name;
    if (c.indexOf('lend') >= 0 || c.indexOf('cdp') >= 0 || c.indexOf('collateral') >= 0) return 'Supply $' + capital + ' of USDC to ' + name + '\'s lending market on ' + chain + ', enable as collateral, and borrow a small amount to activate rewards.';
    if (c.indexOf('dex') >= 0 || c.indexOf('yield') >= 0 || c.indexOf('leveraged farm') >= 0) return 'Provide $' + capital + ' of liquidity to ' + name + '\'s highest-APR pool on ' + chain + ' (e.g., USDC/ETH or stable-stable) and stake the LP tokens if a gauge exists.';
    if (c.indexOf('bridge') >= 0) return 'Bridge $' + capital + ' of USDC from Ethereum to ' + chain + ' via ' + name + ', then use the bridged funds in at least one destination protocol on ' + chain + '.';
    if (c.indexOf('staking') >= 0 || c.indexOf('restak') >= 0) return 'Stake $' + capital + ' of the chain\'s native staking asset (e.g., ETH, SOL) through ' + name + ' and delegate to a top-10 validator by commission; keep the receipt token.';
    if (c.indexOf('perpetual') >= 0 || c.indexOf('derivative') >= 0) return 'Deposit $' + capital + ' of USDC as margin on ' + name + ', open a small delta-neutral position (long + short same size) to qualify for volume rewards.';
    if (c.indexOf('prediction') >= 0) return 'Fund $' + capital + ' of USDC on ' + name + ', place one position in a high-volume market (e.g., election or BTC price), and hold until resolution.';
    if (c.indexOf('curator') >= 0 || c.indexOf('allocator') >= 0) return 'Deposit $' + capital + ' of USDC into ' + name + '\'s highest-TVL vault on ' + chain + ', receive vault shares, and do not withdraw for the hold period.';
    if (c.indexOf('stable') >= 0) return 'Mint $' + capital + ' of the protocol\'s stablecoin on ' + chain + ' by depositing USDC, then deposit the stablecoin into its savings module or highest-yield pool.';
    if (c.indexOf('rwa') >= 0) return 'Mint $' + capital + ' of ' + name + '\'s yield-bearing RWA token on ' + chain + ' (e.g., tokenized T-bill or credit), hold it in your wallet for the full period.';
    if (c.indexOf('insurance') >= 0) return 'Buy $' + capital + ' of smart-contract cover from ' + name + ' on ' + chain + ' for a major protocol (e.g., Aave, Uniswap), keep the policy NFT as proof.';
    if (c.indexOf('risk curator') >= 0 || c.indexOf('liquidity manager') >= 0) return 'Deposit $' + capital + ' of USDC into ' + name + '\'s top vault on ' + chain + ', receive shares, and vote on at least one allocation proposal if governance is live.';
    if (c.indexOf('basis trading') >= 0) return 'Deposit $' + capital + ' of USDC on ' + name + ', open a funded basis trade (long spot + short perp) on ' + chain + ', and maintain funding payments weekly.';
    if (c.indexOf('options') >= 0) return 'Deposit $' + capital + ' of USDC on ' + name + ', sell one covered call or cash-secured put on ETH/BTC with 30-60 day expiry, collect premium.';
    return 'Deposit $' + capital + ' of USDC into ' + name + ' on ' + chain + ', perform the protocol\'s core action (supply, swap, stake), and hold the position.';
  }
  function riskFor(p) {
    var c = (p.category || '').toLowerCase();
    if (c.indexOf('lend') >= 0 || c.indexOf('cdp') >= 0 || c.indexOf('collateral') >= 0) return 'liquidation risk if collateral ratio drops; monitor health factor daily';
    if (c.indexOf('dex') >= 0 || c.indexOf('yield') >= 0 || c.indexOf('leveraged farm') >= 0) return 'impermanent loss on volatile pairs; prefer stable-stable or correlated assets';
    if (c.indexOf('bridge') >= 0) return 'bridge smart-contract risk; use canonical bridges where possible; verify destination chain finality';
    if (c.indexOf('staking') >= 0 || c.indexOf('restak') >= 0) return 'slashing risk from validator misbehavior; delegate to reputable validators with <5% commission';
    if (c.indexOf('perpetual') >= 0 || c.indexOf('derivative') >= 0) return 'funding rate can flip negative; delta-neutral still has basis risk and liquidation risk on extreme moves';
    if (c.indexOf('prediction') >= 0) return 'market may resolve against you; only fund what you can lose; prefer high-liquidity markets';
    if (c.indexOf('curator') >= 0 || c.indexOf('allocator') >= 0) return 'vault strategy may underperform or suffer exploit; check audit status and TVL history';
    if (c.indexOf('stable') >= 0) return 'de-peg risk; algorithmic stables have failed before; prefer overcollateralized or fiat-backed';
    if (c.indexOf('rwa') >= 0) return 'custodial/regulatory risk on underlying assets; token may not be redeemable 1:1 in stress';
    if (c.indexOf('insurance') >= 0) return 'claim may be denied if not covered; read policy terms; cover capacity may be limited';
    if (c.indexOf('basis trading') >= 0) return 'funding flip can make position unprofitable; monitor rates daily; auto-deleveraging risk on perps';
    if (c.indexOf('options') >= 0) return 'assignment risk on short options; premium may not cover loss; European-style avoids early assignment';
    return 'smart-contract risk always present; unaudited or new code carries higher exploit risk; diversify across protocols';
  }
  function stepText(step) {
    var s = step.text + ' Cost: ' + step.cost + '. Time: ' + step.time + '.';
    if (s.length > 600) s = s.slice(0, 596) + '...';
    if (s.length < 20) s = s + " Hold the position and check the protocol's own page.";
    return s;
  }
  function farmSteps(p) {
    var chain = chainOf(p);
    var capital = capitalFor(p);
    var hold = holdDaysFor(p.age_days);
    var gasWeekly = capital >= 150 ? 8 : 4;
    var action = actionFor(p, capital, chain);
    var risk = riskFor(p);
    return [
      { text: 'Use a fresh wallet (hardware or new browser extension) that holds only the funds you plan to farm; store the seed phrase offline in a password manager or paper.', cost: 'under $3 of gas for the first transaction on most chains', time: '5 minutes' },
      { text: action, cost: '$' + capital + ' of capital + ~$' + gasWeekly + ' gas for approvals + deposit; ' + (chain === 'Ethereum' ? 'Ethereum mainnet gas may be $10-30' : 'L2 gas typically $0.50-3'), time: '15-20 minutes to set up (approve tokens, deposit, stake LP if needed)' },
      { text: 'Make one qualifying on-chain action each week: deposit more, borrow/repay, swap, vote on a proposal, or claim pending rewards—varies by protocol; check its docs or Discord for what counts.', cost: '~$' + gasWeekly + ' gas per action (' + (chain === 'Ethereum' ? '$10-30 on Ethereum' : '$0.50-3 on L2s') + ')', time: '10-15 minutes per week' },
      { text: 'Hold the position for at least ' + hold + ' days so your activity spans multiple DefiLlama snapshots (snapshots are ~weekly); do not withdraw early or the position may not qualify.', cost: 'the $' + capital + ' stays locked; opportunity cost of capital', time: hold + ' days (' + Math.ceil(hold / 7) + ' weekly snapshots)' },
      { text: 'Before withdrawing, visit the protocol\'s official points/rewards/airdrop page (linked from its site or docs) and claim only from the exact URL it publishes; verify the contract address on Etherscan.', cost: 'no fee to check; claim tx costs gas', time: '10 minutes to verify and claim' },
      { text: 'Log the wallet address, chain, protocol, deposit tx hash, every weekly action tx hash, claim tx hash, and dates in a spreadsheet or Notion page. Risk: ' + risk, cost: 'nothing but the log', time: '5 minutes to set up, 2 minutes per entry' }
    ].map(stepText);
  }

  function readHash() {
    var hash = window.location.hash.replace(/^#/, '');
    if (!hash) return;
    var params = new URLSearchParams(hash);
    if (params.get('q')) state.q = params.get('q');
    if (params.get('p')) state.selected = params.get('p');
    if (params.get('category')) state.category = params.get('category');
    if (params.get('sort')) state.sort = params.get('sort');
  }
  function writeHash() {
    var params = new URLSearchParams();
    if (state.q) params.set('q', state.q);
    if (state.category !== 'all') params.set('category', state.category);
    if (state.selected) params.set('p', state.selected);
    if (state.sort !== 'implied') params.set('sort', state.sort);
    var next = params.toString();
    if (next) window.history.replaceState(null, '', '#' + next);
    else window.history.replaceState(null, '', window.location.pathname + window.location.search);
  }

  function rows() {
    var q = state.q.trim().toLowerCase();
    return DATA.rows.filter(function (r) {
      if (state.category !== 'all' && r.category !== state.category) return false;
      if (!q) return true;
      var hay = [r.name, r.slug, r.category, (r.chains || []).join(' ')].join(' ').toLowerCase();
      return hay.indexOf(q) >= 0;
    });
  }
  function sortedRows(list) {
    var key = state.sort;
    return list.slice().sort(function (a, b) {
      var av, bv;
      if (key === 'name') { av = a.name.toLowerCase(); bv = b.name.toLowerCase(); }
      else if (key === 'tvl') { av = a.tvl_usd; bv = b.tvl_usd; }
      else if (key === 'growth') { av = a.change_7d === null ? -Infinity : a.change_7d; bv = b.change_7d === null ? -Infinity : b.change_7d; }
      else if (key === 'age') { av = a.age_days === null ? Infinity : a.age_days; bv = b.age_days === null ? Infinity : b.age_days; }
      else if (key === 'category') { av = (a.category || '').toLowerCase(); bv = (b.category || '').toLowerCase(); }
      else { av = a.implied_value_usd; bv = b.implied_value_usd; }
      if (av < bv) return -state.dir;
      if (av > bv) return state.dir;
      return a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0;
    });
  }

  function header() {
    return el('header', { class: 'top' },
      el('div', { class: 'brand' }, el('span', { class: 'mark' }), el('span', { class: 'brand-name', text: 'Token Radar' })),
      el('div', { class: 'top-meta' },
        el('span', { text: 'Snapshot ' + DATA.as_of }),
        el('span', { text: 'DefiLlama protocol index' }),
        el('span', { text: DATA.model_version + ' model' })
      )
    );
  }

  function summary() {
    return el('div', { class: 'summary' },
      el('div', { class: 'summary-card accent' },
        el('div', { class: 'label', text: 'Watchlist' }),
        el('div', { class: 'value', text: DATA.watchlist_size })
      ),
      el('div', { class: 'summary-card' },
        el('div', { class: 'label', text: 'Board Size' }),
        el('div', { class: 'value', text: DATA.board_size })
      ),
      el('div', { class: 'summary-card' },
        el('div', { class: 'label', text: 'Early Rows' }),
        el('div', { class: 'value', text: DATA.early_size })
      ),
      el('div', { class: 'summary-card' },
        el('div', { class: 'label', text: 'Live Tokens' }),
        el('div', { class: 'value', text: DATA.live_size })
      ),
      el('div', { class: 'summary-card' },
        el('div', { class: 'label', text: 'Floor TVL' }),
        el('div', { class: 'value', text: '$' + (DATA.floor_usd / 1e6).toFixed(0) + 'M' })
      ),
      el('div', { class: 'summary-card' },
        el('div', { class: 'label', text: 'Model Version' }),
        el('div', { class: 'value', text: DATA.model_version })
      )
    );
  }

  function lede() {
    return el('section', { class: 'lede' },
      el('div', null,
        el('h1', { text: DATA.watchlist_size + ' watchlist protocols, ranked by implied value' }),
        el('p', { text: 'The watchlist is the floor: every protocol with at least $' + Math.round(DATA.floor_usd / 1e6) + 'M of TVL and no token on record. The early radar adds ' + DATA.early_size + ' pre-token protocols below that floor. Implied value is a model, not a promise.' })
      ),
      el('div', { class: 'facts' },
        el('div', { class: 'fact' }, el('span', { text: 'Watchlist covered' }), el('b', { text: DATA.watchlist_size + ' / ' + DATA.watchlist_size })),
        el('div', { class: 'fact' }, el('span', { text: 'Pre-token rows scored' }), el('b', { text: String(DATA.board_size) })),
        el('div', { class: 'fact' }, el('span', { text: 'Early rows below the floor' }), el('b', { text: String(DATA.early_size) })),
        el('div', { class: 'fact' }, el('span', { text: 'Live-token protocols set aside' }), el('b', { text: String(DATA.live_size) }))
      )
    );
  }

  function controls() {
    var categories = Array.from(new Set(DATA.rows.map(function (r) { return r.category || 'Other'; }))).sort();
    var search = el('input', { type: 'search', id: 'q', placeholder: 'Search name, category or chain', value: state.q, 'aria-label': 'Search the board' });
    search.addEventListener('input', function () { state.q = search.value; writeHash(); render(); });
    var select = el('select', { id: 'category', 'aria-label': 'Filter by category' },
      el('option', { value: 'all', text: 'All categories' }),
      categories.map(function (c) { return el('option', { value: c, text: c, selected: c === state.category ? 'selected' : null }); })
    );
    select.addEventListener('change', function () { state.category = select.value; writeHash(); render(); });
    var sortSelect = el('select', { class: 'sort-select', 'aria-label': 'Sort by' },
      el('option', { value: 'implied', text: 'Implied value', selected: state.sort === 'implied' ? 'selected' : null }),
      el('option', { value: 'name', text: 'Name', selected: state.sort === 'name' ? 'selected' : null }),
      el('option', { value: 'tvl', text: 'TVL', selected: state.sort === 'tvl' ? 'selected' : null }),
      el('option', { value: 'growth', text: '7d Growth', selected: state.sort === 'growth' ? 'selected' : null }),
      el('option', { value: 'age', text: 'Age', selected: state.sort === 'age' ? 'selected' : null }),
      el('option', { value: 'category', text: 'Category', selected: state.sort === 'category' ? 'selected' : null })
    );
    sortSelect.addEventListener('change', function () { state.sort = sortSelect.value; state.dir = -1; writeHash(); render(); });
    var pre = el('button', { type: 'button', 'aria-pressed': state.tab === 'pre-token' ? 'true' : 'false', text: 'Pre-token', onclick: function () { state.tab = 'pre-token'; render(); } });
    var live = el('button', { type: 'button', 'aria-pressed': state.tab === 'live' ? 'true' : 'false', text: 'Live token', onclick: function () { state.tab = 'live'; render(); } });
    return el('div', { class: 'controls' },
      el('div', { class: 'field' }, el('label', { for: 'q', text: 'Search' }), search),
      el('div', { class: 'field' }, el('label', { for: 'category', text: 'Category' }), select),
      el('div', { class: 'sort-controls' }, el('span', { class: 'sort-label', text: 'Sort' }), sortSelect),
      el('div', { class: 'field' }, el('span', { class: 'sub', text: 'Token status' }), el('div', { class: 'tabs' }, pre, live)),
      el('span', { class: 'count', text: state.tab === 'pre-token' ? rows().length + ' of ' + DATA.board_size + ' rows shown' : DATA.live.length + ' live-token protocols' })
    );
  }

  function sortHeader(key, label) {
    return el('th', { scope: 'col' },
      el('button', { type: 'button', onclick: function () { if (state.sort === key) state.dir = -state.dir; else { state.sort = key; state.dir = -1; } render(); } },
        label,
        state.sort === key ? el('span', { 'aria-hidden': 'true', text: state.dir < 0 ? ' ▼' : ' ▲' }) : null
      )
    );
  }

  function boardTable() {
    var list = sortedRows(rows());
    if (list.length === 0) {
      return el('div', { class: 'panel' }, el('div', { class: 'empty' },
        el('h2', { text: 'No protocol matches that filter' }),
        el('p', { text: 'Clear the search or pick another category to see the board again.' }),
        el('button', { class: 'button primary', type: 'button', text: 'Clear filters', onclick: function () { state.q = ''; state.category = 'all'; writeHash(); render(); } })
      ));
    }
    var max = list[0].implied_value_usd || 1;
    var tbody = el('tbody');
    list.forEach(function (r) {
      var growth = r.change_7d === null ? 'n/a' : fmtPct(r.change_7d);
      var growthClass = r.change_7d === null ? '' : r.change_7d >= 0 ? 'pos' : 'neg';
      var chainsHtml = (r.chains && r.chains.length) ? r.chains.map(function(c) { return '<span class="chain-pill">' + c + '</span>'; }).join('') : '<span class="sub">unnamed chain</span>';
      var tr = el('tr', {
        'data-selected': state.selected === r.slug ? 'true' : 'false',
        tabindex: '0',
        onclick: function () { openDetail(r.slug); },
        onkeydown: function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openDetail(r.slug); } }
      },
        el('td', { class: 'num', text: String(r.rank) }),
        el('td', null, el('div', { class: 'name' },
          el('b', { text: r.name }),
          el('div', { class: 'chains-cell' }, { html: chainsHtml })
        )),
        el('td', { class: 'num', text: fmtUsd(r.tvl_usd) }),
        el('td', { class: 'num ' + growthClass, text: growth }),
        el('td', { class: 'num', text: fmtAge(r.age_days) }),
        el('td', null, el('div', { class: 'implied' },
          el('div', { class: 'bar', 'aria-hidden': 'true' }, el('i', { style: 'width:' + Math.max(3, Math.round((r.implied_value_usd / max) * 100)) + '%' })),
          el('span', { class: 'num', text: fmtUsd(r.implied_value_usd) })
        )),
        el('td', null, el('span', { class: 'status', text: 'no token' }))
      );
      tbody.appendChild(tr);
    });
    return el('div', { class: 'panel' },
      el('div', { class: 'table-wrap' },
        el('table', null,
          el('caption', { class: 'sub', text: 'Pre-token protocols, strongest implied value first. Select a row for its model and farm plan.' }),
          el('thead', null, el('tr', null,
            sortHeader('implied', 'Rank'),
            sortHeader('name', 'Protocol'),
            sortHeader('tvl', 'TVL'),
            sortHeader('growth', '7d Growth'),
            sortHeader('age', 'Age'),
            sortHeader('implied', 'Implied Value'),
            el('th', { scope: 'col', text: 'Token' })
          )),
          tbody
        )
      )
    );
  }

  function liveTable() {
    var tbody = el('tbody');
    DATA.live.forEach(function (r) {
      tbody.appendChild(el('tr', null,
        el('td', { class: 'num', text: 'live' }),
        el('td', null, el('div', { class: 'name' }, el('b', { text: r.name }), el('span', { class: 'sub', text: (r.category || 'Other') + ' on ' + (r.chains && r.chains.length ? r.chains.slice(0, 2).join(', ') : 'an unnamed chain') }))),
        el('td', { class: 'num', text: fmtUsd(r.tvl_usd) }),
        el('td', { class: 'num ' + (r.change_7d !== null && r.change_7d >= 0 ? 'pos' : 'neg'), text: fmtPct(r.change_7d) }),
        el('td', { class: 'num', text: fmtUsd(r.mcap_usd) }),
        el('td', null, el('span', { class: 'status', text: 'already trades' }))
      ));
    });
    return el('div', { class: 'panel' },
      el('div', { class: 'table-wrap' },
        el('table', null,
          el('caption', { class: 'sub', text: 'Token live: these protocols already trade, so their market cap is a fact, not a model. They are set aside from the pre-token ranking.' }),
          el('thead', null, el('tr', null, el('th', { scope: 'col', text: 'Status' }), el('th', { scope: 'col', text: 'Protocol' }), el('th', { scope: 'col', text: 'TVL' }), el('th', { scope: 'col', text: '7d' }), el('th', { scope: 'col', text: 'Market cap' }), el('th', { scope: 'col', text: 'Token' }))),
          tbody
        )
      )
    );
  }

  function modelPanel() {
    var m = DATA.model;
    return el('section', { class: 'panel model' },
      el('div', { class: 'model-header' },
        el('h2', { text: 'How implied value is computed' }),
        el('span', { class: 'badge category', text: DATA.model_version })
      ),
      el('p', { class: 'sub', text: 'Every row is scored by one function of the snapshot figures. No protocol name is special-cased, and no row is hand-picked. The model multiplies TVL by a base multiple, then applies growth, maturity, category, chain, and momentum factors.' }),
      el('div', { class: 'model-formula' },
        'implied = round( tvl_usd × ' + m.base_multiple + ' × (1 + clamp(change_7d, ' + m.growth_floor + ', ' + m.growth_cap + ') / 100 × ' + m.growth_weight + ') × (' + m.maturity_floor + ' + min(age_days, ' + m.maturity_days + ') / ' + m.maturity_days + ' × ' + m.maturity_range + ') × category_weight × chain_bonus × tvl_momentum )'
      ),
      el('div', { class: 'model-breakdown' },
        el('div', { class: 'model-factor' },
          el('div', { class: 'label', text: 'Base Multiple' }),
          el('div', { class: 'value', text: m.base_multiple + '×' })
        ),
        el('div', { class: 'model-factor' },
          el('div', { class: 'label', text: 'Growth Weight' }),
          el('div', { class: 'value', text: m.growth_weight + '×' })
        ),
        el('div', { class: 'model-factor' },
          el('div', { class: 'label', text: 'Growth Clamp' }),
          el('div', { class: 'value', text: m.growth_floor + '% … ' + m.growth_cap + '%' })
        ),
        el('div', { class: 'model-factor' },
          el('div', { class: 'label', text: 'Maturity Range' }),
          el('div', { class: 'value', text: m.maturity_floor + '–' + (m.maturity_floor + m.maturity_range) + '×' })
        ),
        el('div', { class: 'model-factor' },
          el('div', { class: 'label', text: 'Category Weights' }),
          el('div', { class: 'value', text: 'Lending ' + (m.category_weights.Lending || 1) + '×, DEX ' + (m.category_weights.Dexs || 1) + '×, RWA ' + (m.category_weights.RWA || 1) + '×' })
        ),
        el('div', { class: 'model-factor' },
          el('div', { class: 'label', text: 'Chain Bonus' }),
          el('div', { class: 'value', text: '1 chain 1.00× → 5+ chains ' + (m.chain_bonus[m.chain_bonus.length - 1] || 1.15) + '×' })
        ),
        el('div', { class: 'model-factor' },
          el('div', { class: 'label', text: 'TVL Momentum' }),
          el('div', { class: 'value', text: '±' + (m.tvl_momentum_weight * 100).toFixed(1) + '%' })
        )
      ),
      el('p', { class: 'sub', text: 'TVL and seven-day growth come from the snapshot. Age is the time since the protocol was first listed; an unlisted age uses ' + m.unknown_age_days + ' days. The early radar is every pre-token protocol below the watchlist floor, by TVL, and the live-token protocols are set aside with their market caps shown.' })
    );
  }

  var dialog = el('dialog', { class: 'detail', id: 'detail', 'aria-labelledby': 'detail-title' });
  dialog.addEventListener('close', function () { state.selected = null; writeHash(); });

  function openDetail(slug) {
    var row = DATA.rows.filter(function (r) { return r.slug === slug; })[0];
    if (!row) return;
    state.selected = slug;
    writeHash();
    dialog.textContent = '';
    var steps = farmSteps(row);
    var recomputed = impliedOf(row, DATA.model);
    var match = recomputed === row.implied_value_usd;
    var chainsHtml = (row.chains && row.chains.length) ? row.chains.map(function(c) { return '<span class="chain-pill">' + c + '</span>'; }).join('') : '<span class="sub">unnamed chain</span>';
    
    dialog.appendChild(el('div', { class: 'detail-head' },
      el('div', null,
        el('span', { class: 'brand-name', text: 'Rank ' + row.rank + ' of ' + DATA.board_size }),
        el('h2', { id: 'detail-title', text: row.name }),
        el('div', { class: 'chains-cell', html: chainsHtml }),
        el('p', { class: 'sub', text: (row.category || 'Other') })
      ),
      el('button', { class: 'close', type: 'button', 'aria-label': 'Close details', text: 'Close', onclick: function () { dialog.close(); } })
    ));
    dialog.appendChild(el('section', { class: 'detail-section' },
      el('h3', { text: 'Implied Value Breakdown' }),
      el('div', { class: 'equation' },
        el('div', null, el('span', { text: 'TVL' }), el('b', { class: 'num', text: fmtUsd(row.tvl_usd) })),
        el('div', null, el('span', { text: 'Base Multiple' }), el('b', { class: 'num', text: DATA.model.base_multiple + '×' })),
        el('div', null, el('span', { text: 'Seven-day Growth' }), el('b', { class: 'num', text: fmtPct(row.change_7d) })),
        el('div', null, el('span', { text: 'Growth Multiplier' }), el('b', { class: 'num', text: (row.growth_multiplier || 1).toFixed(4) + '×' })),
        el('div', null, el('span', { text: 'Age (days)' }), el('b', { class: 'num', text: fmtAge(row.age_days) })),
        el('div', null, el('span', { text: 'Maturity Multiplier' }), el('b', { class: 'num', text: (row.maturity_multiplier || 1).toFixed(4) + '×' })),
        el('div', null, el('span', { text: 'Category Weight' }), el('b', { class: 'num', text: (row.category_weight || 1).toFixed(4) + '×' })),
        el('div', null, el('span', { text: 'Chain Bonus' }), el('b', { class: 'num', text: (row.chain_bonus || 1).toFixed(4) + '×' })),
        el('div', null, el('span', { text: 'TVL Momentum' }), el('b', { class: 'num', text: (row.tvl_momentum || 1).toFixed(4) + '×' })),
        el('div', null, el('span', { text: 'Implied Value' }), el('b', { class: 'num', text: fmtUsd(row.implied_value_usd) }))
      ),
      el('p', { class: 'sub', text: 'Model ' + DATA.model_version + ': the page recomputes this row as ' + fmtUsd(recomputed) + (match ? ', matching board.json.' : ', differing from board.json (data may be stale).') + ' This is an estimate, not a price.' })
    ));
    dialog.appendChild(el('section', { class: 'detail-section' },
      el('h3', { text: 'Farm Plan' }),
      el('ol', { class: 'steps' }, steps.map(function (s) {
        var at = s.indexOf(' Cost: ');
        var action = at >= 0 ? s.slice(0, at) : s;
        var tail = at >= 0 ? s.slice(at + 1) : '';
        return el('li', null, el('b', { text: action }), el('span', { class: 'cost', text: tail }));
      }))
    ));
    if (typeof dialog.showModal === 'function') {
      if (!dialog.open) dialog.showModal();
    } else {
      dialog.setAttribute('open', '');
    }
  }

  function render() {
    app.textContent = '';
    var shell = el('div', { class: 'shell' });
    shell.appendChild(header());
    shell.appendChild(summary());
    shell.appendChild(lede());
    shell.appendChild(controls());
    shell.appendChild(state.tab === 'pre-token' ? boardTable() : liveTable());
    if (state.tab === 'pre-token') shell.appendChild(modelPanel());
    app.appendChild(shell);
    app.setAttribute('aria-busy', 'false');
    if (!dialog.isConnected) app.appendChild(dialog);
    if (state.selected) openDetail(state.selected);
  }

  readHash();
  render();
  window.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && dialog.open) dialog.close();
  });
})();