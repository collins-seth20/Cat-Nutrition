(() => {
  'use strict';
  const DATA = window.CAT_DATA;
  const $ = id => document.getElementById(id);
  const foodByName = new Map(DATA.foods.map(food => [food.name.toLowerCase(), food]));
  const profileKey = 'cat-formulator-profiles-v1';
  const archivedKey = 'cat-formulator-profile-archive-v1';
  const state = { items: [], profiles: readStore(profileKey, {}), archive: readStore(archivedKey, {}), selectedProfile: '' };
  const round = (x, digits = 2) => Number.isFinite(x) ? x.toLocaleString(undefined, {maximumFractionDigits: digits}) : '—';
  const num = value => Number(value) || 0;
  const safe = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const toast = message => { $('toast').textContent = message; $('toast').classList.add('show'); clearTimeout(toast.timer); toast.timer = setTimeout(() => $('toast').classList.remove('show'), 3500); };
  function readStore(key, fallback) { try { return JSON.parse(localStorage.getItem(key)) || fallback; } catch { return fallback; } }
  function saveStore(key, value) { localStorage.setItem(key, JSON.stringify(value)); }
  function food(name) { return foodByName.get(String(name || '').trim().replace(/\s+/g, ' ').toLowerCase()); }
  function grams(amount, unit) { return amount * ({g:1,mg:.001,'µg':.000001,oz:28.3495,lbs:453.592}[unit] || 0); }
  function nutrientFactor(amount, unit) { return ['pills/tablets','drops','tsp'].includes(unit) ? amount : grams(amount, unit) / 100; }
  function ageStage() {
    const age = num($('age').value), unit = $('ageUnit').value, pregnancy = $('pregnancy').value;
    if ((unit === 'Weeks' && age < 17) || (unit === 'Months' && age < 4)) return 'kitten';
    if (pregnancy === 'Gestation') return 'gestation';
    if (pregnancy === 'Lactation') return 'lactation';
    if (unit === 'Years (1 or more)') return 'adult';
    if (unit === 'Weeks') return age < 52 ? 'kitten' : 'adult';
    return age < 12 ? 'kitten' : 'adult';
  }
  function dailyEnergy() {
    const weight = num($('weight').value), age = num($('age').value), ageUnit = $('ageUnit').value;
    if (weight <= 0 || age < 0 || (ageUnit === 'Years (1 or more)' && age < 1)) return null;
    const kg = $('weightUnit').value === 'Pounds' ? weight * .453592 : weight;
    const multiplier = ageUnit === 'Weeks' ? (age < 17 ? 2.5 : age < 52 ? 2 : 1.4) : ageUnit === 'Months' ? (age < 4 ? 2.5 : age < 12 ? 2 : 1.4) : 1.4;
    const young = multiplier > 1.4;
    const neuter = young || $('neuter').value === 'Intact' ? 1 : .85714;
    const status = young || $('status').value === 'Maintain or Kitten' ? 1 : $('status').value === 'Overweight' ? .571429 : .71429;
    const pregnancy = young || $('neuter').value === 'Spayed or Neutered' ? 1 : $('pregnancy').value === 'Gestation' ? 1.78571 : $('pregnancy').value === 'Lactation' ? 2.14286 : 1;
    return 70 * Math.pow(kg, .75) * multiplier * neuter * status * pregnancy;
  }
  function foodRate() {
    const age = num($('age').value), unit = $('ageUnit').value;
    if (unit === 'Weeks') return age <= 7 ? .10 : age <= 13 ? .09 : age <= 17 ? .08 : age <= 22 ? .07 : age <= 26 ? .06 : age <= 30 ? .05 : age <= 35 ? .04 : age <= 52 ? .03 : adultRate();
    if (unit === 'Months') return age <= 2 ? .10 : age <= 3 ? .09 : age <= 4 ? .08 : age <= 5 ? .07 : age <= 6 ? .06 : age <= 7 ? .05 : age <= 8 ? .04 : age <= 12 ? .03 : adultRate();
    return adultRate();
  }
  function adultRate() { return $('status').value === 'Overweight' ? .02 : $('status').value === 'Inactive or Obese Prone' ? .025 : .03; }
  function nutrientData() {
    const values = Array(DATA.headers.length).fill(0), unknown = Array(DATA.headers.length).fill(false), pmr = Array(5).fill(0);
    let weight = 0;
    for (const item of state.items) {
      const f = food(item.name); if (!f || item.amount <= 0) continue;
      const factor = nutrientFactor(item.amount, item.unit), g = grams(item.amount, item.unit);
      weight += g;
      f.n.forEach((value, i) => { if (value === null) unknown[i] = true; else values[i] += value * factor; });
      f.pmr.forEach((value, i) => pmr[i] += value * g);
    }
    return {values, unknown, pmr, weight};
  }
  function referenceKey() {
    const stage = ageStage(), guide = $('guideline').value;
    return guide === 'AAFCO' ? `AAFCO_${stage === 'adult' ? 'adult' : 'growth'}` : `${guide}_${stage === 'kitten' && guide === 'FEDIAF' ? 'growth' : stage}`;
  }
  function referenceAmount(nutrient, kcal, kind = 'refs') {
    if (!kcal) return null;
    const value = nutrient[kind]?.[referenceKey()];
    return typeof value === 'number' ? value * kcal / 1000 * (nutrient.row === 106 ? 1/.3 : nutrient.row === 107 ? 1/.025 : 1) : null;
  }
  function required(nutrient, kcal) { return referenceAmount(nutrient, kcal); }
  function nutrientResult(n, totals) {
    if (n.parts.some(i => i === null || totals.unknown[i])) return null;
    return n.parts.reduce((sum, i) => sum + totals.values[i], 0) * n.scale;
  }
  function ratioTotals(t) {
    const get = name => t.values[DATA.headers.indexOf(name)];
    const r = $('ratioSelect').value;
    const pairs = {
      'Zinc:Copper':[get('Zinc (mg)'),get('Copper (mg)')],
      'Calcium:Copper':[get('Calcium (mg)'),get('Copper (mg)')],
      'Iron:Copper':[get('Iron (mg)'),get('Copper (mg)')],
      'Zinc:Iron':[get('Zinc (mg)'),get('Iron (mg)')],
      'Calcium:Phosphorous':[get('Calcium (mg)'),get('Phosphorus (mg)')],
      'Sodium:Potassium':[get('Sodium (mg)'),get('Potassium (mg)')],
      'LA:ALA':[get('LA\nLinoleic Acid (g)'),get('ALA \nα-Linolenic Acid (g)')],
      'Vitamin A:Vitamin D (IU)':[get('Vitamin A, RAE (µg)')/.3,get('Vitamin D3 (cholecalciferol) (µg)')/.025]
    };
    const [a,b] = pairs[r];
    const ratioHeaders = {'Zinc:Copper':['Zinc (mg)','Copper (mg)'],'Calcium:Copper':['Calcium (mg)','Copper (mg)'],'Iron:Copper':['Iron (mg)','Copper (mg)'],'Zinc:Iron':['Zinc (mg)','Iron (mg)'],'Calcium:Phosphorous':['Calcium (mg)','Phosphorus (mg)'],'Sodium:Potassium':['Sodium (mg)','Potassium (mg)'],'LA:ALA':['LA\nLinoleic Acid (g)','ALA \nα-Linolenic Acid (g)'],'Vitamin A:Vitamin D (IU)':['Vitamin A, RAE (µg)','Vitamin D3 (cholecalciferol) (µg)']};
    const missing = ratioHeaders[r].some(name => t.unknown[DATA.headers.indexOf(name)]);
    const ideals = {'Zinc:Copper':'15 : 1 adult · 9 : 1 kitten','Calcium:Copper':'613 : 1 adult · 956 : 1 kitten','Iron:Copper':'16.8 : 1 adult · 9.6 : 1 kitten','Zinc:Iron':'0.9 : 1','Calcium:Phosphorous':'1–1.1 : 1 adult · 1.1 : 1 kitten','Sodium:Potassium':'1 : 7.7 adult · 1 : 2.9 kitten','LA:ALA':'No workbook ideal','Vitamin A:Vitamin D (IU)':'12 : 1 adult · 14.9 : 1 kitten'};
    $('ratioValue').textContent = missing ? 'Unknown' : b > 0 && Number.isFinite(a) ? `${round(a/b,1)} : 1` : 'No data';
    $('ratioIdeal').textContent = ideals[r];
  }
  function renderCat(kcal) {
    $('calories').textContent = kcal ? round(kcal, 1) : 'Enter valid details';
    const amount = num($('weight').value) * foodRate() * ($('weightUnit').value === 'Pounds' ? 16 : 1000);
    $('foodEstimate').textContent = amount > 0 ? round(amount, 1) : '—';
    $('foodEstimateUnit').textContent = $('weightUnit').value === 'Pounds' ? 'ounces / day' : 'grams / day';
    $('lifeStage').textContent = ({kitten:'Growth',adult:'Adult',gestation:'Gestation',lactation:'Lactation'})[ageStage()];
  }
  function renderIngredients(t) {
    $('ingredientRows').innerHTML = state.items.map((item, index) => {
      const f = food(item.name), factor = nutrientFactor(item.amount, item.unit), kcal = f?.n[0] == null ? 'Unknown' : `${round(f.n[0] * factor, 1)} kcal`;
      return `<tr><td class="name">${safe(item.name)}</td><td><input aria-label="Amount for ${safe(item.name)}" type="number" min="0" step="0.01" data-index="${index}" data-field="amount" value="${safe(item.amount)}"></td><td><select aria-label="Unit for ${safe(item.name)}" data-index="${index}" data-field="unit">${['g','mg','µg','oz','lbs','pills/tablets','drops','tsp'].map(u => `<option ${u===item.unit?'selected':''}>${u}</option>`).join('')}</select></td><td>${kcal}</td><td><input aria-label="Unit price for ${safe(item.name)}" type="number" min="0" step="0.01" data-index="${index}" data-field="price" value="${item.price ?? ''}" placeholder="Optional"></td><td><button class="quiet" type="button" data-remove="${index}" aria-label="Remove ${safe(item.name)}">Remove</button></td></tr>`;
    }).join('') || '<tr><td colspan="6">No foods added. Search a product above to start.</td></tr>';
    $('mealTotal').textContent = `Meal total: ${round(t.weight, 1)} g · ${round(t.weight*.035274, 2)} oz`;
  }
  function renderNutrition(t, kcal) {
    const mealKcal = t.unknown[0] ? null : t.values[0];
    $('mealEnergy').textContent = !state.items.length ? '—' : mealKcal === null ? 'Unknown' : `${round(mealKcal, 1)} kcal`;
    const ratio = kcal && mealKcal !== null ? mealKcal/kcal : null;
    $('energyStatus').textContent = !state.items.length || ratio === null ? 'Add foods with known calories' : ratio < .6 ? 'Very low vs estimate' : ratio < .8 ? 'Low vs estimate' : ratio > 1.4 ? 'Very high vs estimate' : ratio > 1.2 ? 'High vs estimate' : 'Within 20% of estimate';
    const spotlight = DATA.nutrients.find(n => n.row === num($('nutrientSpotlight').value)) || DATA.nutrients[0];
    const spot = nutrientResult(spotlight, t), target = required(spotlight, kcal);
    $('spotlightValue').textContent = !state.items.length ? '—' : spot === null ? 'Unknown' : round(spot, 3);
    $('spotlightLabel').textContent = `${spotlight.label} · target ${target === null ? 'not listed' : round(target,3)}`;
    ratioTotals(t);
    const incomplete = DATA.nutrients.filter(n => nutrientResult(n,t) === null).length;
    $('dataCaution').hidden = !state.items.length || incomplete === 0;
    $('dataCaution').textContent = `${incomplete} displayed nutrient values are incomplete because one or more selected food entries have blank source data. Unknown is not zero.`;
    const percent = $('differenceView').value === 'percent';
    $('differenceHeading').textContent = percent ? '% of target' : 'Difference';
    $('nutrientRows').innerHTML = DATA.nutrients.map(n => {
      const value = nutrientResult(n,t), req = required(n,kcal), minimum = referenceAmount(n,kcal,'minRefs'), max = referenceAmount(n,kcal,'maxRefs');
      const status = !state.items.length ? 'Add foods' : value === null ? 'Unknown data' : req === null ? 'No listed target' : max !== null && value > max ? 'Above maximum range' : value >= req ? 'Meeting allowance' : minimum !== null && value >= minimum ? 'Within minimal range' : 'Below minimal range';
      const cls = !state.items.length || value === null || req === null ? 'unknown' : status === 'Above maximum range' || status === 'Below minimal range' ? 'low' : 'good';
      const diff = value === null || req === null ? '—' : percent ? `${round(value/req*100,1)}%` : round(value-req,3);
      return `<tr><td>${safe(n.label)}</td><td>${value === null ? 'Unknown' : round(value,3)}</td><td>${req === null ? '—' : round(req,3)}</td><td>${diff}</td><td><span class="badge ${cls}">${status}</span></td></tr>`;
    }).join('');
    const labels = ['Muscle meat','Muscular organ','Bone','Liver','Second secreting organ'];
    const pmrTotal = t.pmr.reduce((a,b) => a+b,0);
    $('pmrValues').innerHTML = labels.map((name,i) => `<span>${name}<b>${pmrTotal ? round(t.pmr[i]/pmrTotal*100,1) : '—'}${pmrTotal?'%':''}</b></span>`).join('');
  }
  function renderBatch(t) {
    const period = $('batchPeriod').value, count = Math.max(0,num($('batchCount').value));
    const days = count * (period === 'Weeks' ? 7 : period === 'Months (30 Days)' ? 30 : 1);
    const priceUnit = $('priceUnit').value, currency = $('currency').value || '$';
    let totalCost = 0, priced = 0;
    $('batchRows').innerHTML = state.items.map(item => {
      const g = grams(item.amount,item.unit), unitQty = priceUnit === 'g' ? g : priceUnit === 'oz' ? g*.035274 : priceUnit === 'lb' ? g*.00220462 : g/1000;
      const cost = item.price === '' || item.price == null ? null : unitQty * num(item.price) * days;
      if (cost !== null) { totalCost += cost; priced++; }
      return `<tr><td>${safe(item.name)}</td><td>${round(item.amount,2)} ${safe(item.unit)}</td><td>${round(item.amount*days,2)} ${safe(item.unit)}</td><td>${cost === null ? '—' : `${safe(currency)}${round(cost,2)}`}</td></tr>`;
    }).join('') || '<tr><td colspan="4">Add foods to see a batch plan.</td></tr>';
    const unit = $('batchUnit').value;
    const batchWeight = t.weight * days * (unit === 'in grams' ? 1 : unit === 'in ounces' ? .035274 : unit === 'in pounds' ? .00220462 : .001);
    $('batchTotal').textContent = `${round(batchWeight,2)} ${unit.replace('in ','')}`;
    $('costTotal').textContent = priced ? `${currency}${round(totalCost,2)}` : '—';
    $('costNote').textContent = priced === state.items.length && priced ? 'All ingredients priced' : `${priced} of ${state.items.length} ingredients priced`;
  }
  function render() { const kcal = dailyEnergy(), totals = nutrientData(); renderCat(kcal); renderIngredients(totals); renderNutrition(totals,kcal); renderBatch(totals); }
  function refreshProfiles() {
    const local = Object.keys(state.profiles).map(name => `<option value="local:${safe(name)}">${safe(name)} · saved here</option>`).join('');
    const samples = DATA.sampleProfiles.map((p,i) => `<option value="sample:${i}">${safe(p.name)} · workbook</option>`).join('');
    $('profileSelect').innerHTML = '<option value="">Choose a profile…</option>' + local + samples;
    $('profileSelect').value = state.selectedProfile;
  }
  function captureProfile() { return {name:$('profileName').value.trim(),cat:$('catName').value,weight:num($('weight').value),weightUnit:$('weightUnit').value,age:num($('age').value),ageUnit:$('ageUnit').value,neuter:$('neuter').value,status:$('status').value,pregnancy:$('pregnancy').value,items:state.items.map(item=>({...item}))}; }
  function loadProfile(p) {
    if (!p) return;
    $('profileName').value = p.name || '';
    $('catName').value = p.cat || '';
    $('weight').value = p.weight || '';
    $('weightUnit').value = p.weightUnit || 'Pounds';
    $('age').value = p.age ?? '';
    $('ageUnit').value = p.ageUnit || 'Months';
    $('neuter').value = p.neuter || 'Intact';
    $('status').value = p.status || 'Maintain or Kitten';
    $('pregnancy').value = p.pregnancy || 'N/A';
    state.items = (p.items || []).filter(item => food(item.name)).map(item => ({name:food(item.name).name,amount:num(item.amount),unit:item.unit || 'g',price:item.price ?? ''}));
    render(); toast(`Loaded ${p.name || 'profile'}`);
  }
  function filteredFoods() { return $('foodCollection').value === 'collins' ? DATA.foods.filter(f => f.collinsOption) : DATA.foods; }
  function renderFoodChoices() {
    const options = filteredFoods();
    $('foodOptions').innerHTML = options.map(f => `<option value="${safe(f.name)}"></option>`).join('');
    $('collinsOptions').hidden = $('foodCollection').value !== 'collins';
    $('collinsOptions').innerHTML = DATA.foods.filter(f => f.collinsOption).map(f => `<article class="collins-option"><div><h3>${safe(f.name.replace('Collins — ',''))}</h3><p>${safe(f.description)}</p><small>Per 100 g: ${round(f.n[0],0)} kcal · ${round(f.n[3],1)} g protein · ${round(f.n[4],1)} g fat</small></div><button type="button" data-collins-add="${safe(f.name)}">Add</button></article>`).join('');
  }
  renderFoodChoices();
  $('foodCollection').addEventListener('change', () => { $('foodSearch').value=''; renderFoodChoices(); });
  $('collinsOptions').addEventListener('click', e => { const button=e.target.closest('[data-collins-add]'); if (!button) return; $('foodSearch').value=button.dataset.collinsAdd; $('foodAmount').value='100'; $('foodUnit').value='g'; $('addFood').click(); });
  $('nutrientSpotlight').innerHTML = DATA.nutrients.map(n => `<option value="${n.row}" ${n.row===75?'selected':''}>${safe(n.label)}</option>`).join('');
  refreshProfiles();
  document.querySelectorAll('input, select').forEach(el => {
    if (['foodSearch','foodAmount','foodUnit','profileName','profileSelect'].includes(el.id) || el.closest('#ingredientRows')) return;
    el.addEventListener('input', render); el.addEventListener('change', render);
  });
  $('addFood').addEventListener('click', () => {
    const f = food($('foodSearch').value), amount = num($('foodAmount').value);
    if (!f) return toast('Choose a food from the list.');
    if (amount <= 0) return toast('Enter an amount greater than zero.');
    if (state.items.length >= 30) return toast('The workbook supports up to 30 ingredients.');
    state.items.push({name:f.name,amount,unit:$('foodUnit').value,price:''});
    $('foodSearch').value = ''; render(); toast(`Added ${f.name}`);
  });
  $('foodSearch').addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); $('addFood').click(); } });
  $('ingredientRows').addEventListener('change', e => { const el=e.target, i=num(el.dataset.index); if (!state.items[i] || !el.dataset.field) return; state.items[i][el.dataset.field] = el.dataset.field === 'unit' ? el.value : el.value === '' && el.dataset.field === 'price' ? '' : Math.max(0,num(el.value)); render(); });
  $('ingredientRows').addEventListener('click', e => { const button=e.target.closest('[data-remove]'); if (!button) return; state.items.splice(num(button.dataset.remove),1); render(); });
  $('clearMeal').addEventListener('click', () => { state.items=[]; render(); toast('Ingredient list cleared.'); });
  $('loadProfile').addEventListener('click', () => { const value=$('profileSelect').value; if (!value) return toast('Choose a profile first.'); state.selectedProfile=value; const [kind,id]=value.split(':'); loadProfile(kind==='sample' ? DATA.sampleProfiles[num(id)] : state.profiles[id]); });
  $('saveProfile').addEventListener('click', () => { const profile=captureProfile(); if (!profile.name) return toast('Enter a profile name.'); state.profiles[profile.name]=profile; saveStore(profileKey,state.profiles); state.selectedProfile=`local:${profile.name}`; refreshProfiles(); toast('Profile saved in this browser.'); });
  $('deleteProfile').addEventListener('click', () => { const selected=$('profileSelect').value; if (!selected.startsWith('local:')) return toast('Select a locally saved profile.'); const name=selected.slice(6); state.archive[name]={...state.profiles[name],archivedAt:new Date().toISOString()}; delete state.profiles[name]; saveStore(archivedKey,state.archive); saveStore(profileKey,state.profiles); state.selectedProfile=''; refreshProfiles(); toast('Profile moved to local archive.'); });
  render();
})();
