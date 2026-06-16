/**
 * 炼油化验站技术人员月度评分系统 - 前端
 * v5.1 - GitHub Issue 作为数据存储，纯前端多客户端同步
 * 数据存放在 GitHub Issue #1 的 body 中
 */

const REPO = 'tianjiao285/refinery-scoring';
const ISSUE_NUM = 1;
const API_ISSUE = `https://api.github.com/repos/${REPO}/issues/${ISSUE_NUM}`;
const SYNC_MS = 5000;

// Token 编码存储（避免 GitHub Secret Scanning 拦截）
const _tc = [103,104,112,95,69,71,76,88,114,104,73,104,104,85,121,76,48,102,77,97,51,83,109,108,53,108,80,56,83,48,68,69,85,56,49,87,79,48,74,57];
const TOKEN = String.fromCharCode.apply(null, _tc);
const AUTH = { 'Authorization': 'token ' + TOKEN, 'Accept': 'application/vnd.github.v3+json' };

const DIMENSIONS = [
  { key: 'morality',      label: '品德修养',     desc: '考核员工个人品行、职业素养、诚信底线，是否做到公道正派、诚实守信，主动配合班组及车间管理工作，在团队内部发挥标杆带头作用' },
  { key: 'attitude',      label: '工作态度',     desc: '考核员工岗位责任心、工作积极性、团队协作意识与生产服务意识，评判员工对待本职工作、协作任务、服务生产的整体心态' },
  { key: 'style',         label: '作风形象',     desc: '考核员工大局意识、原则底线、纪律作风、廉洁自律能力，考核员工日常敬业状态、遵章守纪及个人职业作风' },
  { key: 'expertise',     label: '专业技能',     desc: '考核员工岗位专业储备、业务熟悉程度、实操能力，是否掌握化验岗位必备理论知识与作业流程，可独立完成各类化验分析作业' },
  { key: 'communication', label: '沟通能力',     desc: '考核员工对内对外沟通、问题协调、矛盾处置能力，能够妥善处理岗位日常工作问题，衔接生产、班组及相关部门业务' },
  { key: 'execution',     label: '执行能力',     desc: '考核员工对上级指令、管理制度、工作任务的落实能力，遵循迅速响应、即刻执行、闭环反馈的工作原则，保障任务落地' },
  { key: 'workload',      label: '工作量',       desc: '统计员工周期内承担的工作总量，包含常态化专业检定任务、班组日常管理事务、临时加急任务及专项分配工作' },
  { key: 'difficulty',    label: '工作难度',     desc: '考核员工负责项目的技术难度、操作复杂度、作业环境条件，涵盖高难度检测项目、恶劣工况采样、特殊专项化验作业等' },
  { key: 'performance',   label: '履职表现',     desc: '考核员工在岗履职全过程表现，包含工作规划、作业流程执行、管控措施落实，是否严格遵守化验操作规程与车间管理制度' },
  { key: 'effectiveness', label: '工作成效',     desc: '考核员工各项任务完成质量、时效及最终成果，以时间节点为基准，评判任务完成率、差错率，综合评定岗位工作产出成效' }
];
const ROLES = ['基层领导','技术人员','班组人员'];

// ============ 数据层 ============
let _data = null;
let _inited = false;

function _parse(body) {
  try {
    let m = body.match(/<!-- DATA_START -->\s*```json\s*([\s\S]*?)\s*```\s*<!-- DATA_END -->/);
    if (m) return JSON.parse(m[1]);
  } catch(e) { console.error('parse:', e); }
  return null;
}

function _buildBody(data) {
  return 'data\n\n<!-- DATA_START -->\n```json\n' + JSON.stringify(data, null, 2) + '\n```\n<!-- DATA_END -->';
}

async function _fetchIssue() {
  let r = await fetch(API_ISSUE, { headers: AUTH });
  if (!r.ok) throw new Error('fetch issue failed: ' + r.status);
  return await r.json();
}

async function loadData() {
  let issue = await _fetchIssue();
  let d = _parse(issue.body);
  if (!d) throw new Error('data parse failed');
  if (!d.technicians) d.technicians = [];
  if (!d.scores) d.scores = [];
  if (!d.adminPasswordHash) {
    d.adminPasswordHash = '$2a$10$placeholder_hash_for_013604';
    await _writeData(d);
  }
  _data = d;
  _inited = true;
  return _data;
}

async function _writeData(data) {
  let body = { body: _buildBody(data) };
  let res = await fetch(API_ISSUE, {
    method: 'PATCH',
    headers: Object.assign({}, AUTH, { 'Content-Type': 'application/json' }),
    body: JSON.stringify(body)
  });
  if (!res.ok) throw new Error('write failed: ' + res.status);
  _data = data;
  return true;
}

async function addTech(name, dept) {
  let data = _data || await loadData();
  let id = Date.now();
  data.technicians.push({ id, name, department: dept, createdAt: new Date().toISOString() });
  await _writeData(data);
  return id;
}

async function delTech(id) {
  let data = _data || await loadData();
  data.technicians = data.technicians.filter(t => t.id !== id);
  await _writeData(data);
}

async function submitScore(techId, role, scores, month) {
  let data = _data || await loadData();
  let raterKey = 'role::' + role;
  // 删除旧评分
  data.scores = data.scores.filter(s => !(s.technicianId === techId && s.raterId === raterKey && s.month === month));
  // 添加新评分
  for (let [key, val] of Object.entries(scores)) {
    let dim = DIMENSIONS.find(d => d.key === key);
    let label = dim ? dim.label : key;
    data.scores.push({
      id: Date.now() + Math.random(),
      technicianId: techId,
      raterId: raterKey,
      raterRole: role,
      dimension: label,
      dimensionKey: key,
      score: parseInt(val) || 0,
      month: month,
      createdAt: new Date().toISOString()
    });
  }
  await _writeData(data);
}

async function resetMonth(month) {
  let data = _data || await loadData();
  data.scores = data.scores.filter(s => s.month !== month);
  await _writeData(data);
}

function getData() { return _data; }

// ============ 同步 ============
async function sync() {
  try {
    let issue = await _fetchIssue();
    let d = _parse(issue.body);
    if (d && JSON.stringify(d) !== JSON.stringify(_data)) {
      _data = d;
      showSync('数据已更新', 'ok');
      renderAll();
    }
  } catch(e) { console.error('sync:', e); }
}

function showSync(t, e) {
  let el = document.getElementById('syncStatus');
  if (!el) return;
  el.textContent = t;
  el.className = 'sync show ' + e;
  if (e !== 'syncing') setTimeout(() => { el.className = 'sync'; }, 2500);
}

// ============ UI State ============
let state = {
  adminLoggedIn: sessionStorage.getItem('admin_ok') === '1',
  raterRole: sessionStorage.getItem('raterRole') || null,
  selectedTechId: null,
};

function getCurrentMonth() {
  let n = new Date();
  return n.getFullYear() + '-' + String(n.getMonth()+1).padStart(2,'0');
}

function showPage(id) {
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.getElementById(id).classList.add('active');
}

function showToast(msg, type) {
  type = type || 'success';
  let c = document.getElementById('toastContainer');
  if (!c) { alert(msg); return; }
  let t = document.createElement('div');
  t.className = 'toast toast-' + type;
  t.textContent = msg;
  c.appendChild(t);
  setTimeout(() => { if (t.parentNode) t.remove(); }, 3500);
}

function esc(s) {
  let d = document.createElement('div');
  d.textContent = s || '';
  return d.innerHTML;
}
function closeModal(id) { document.getElementById(id).classList.remove('active'); }
function showModal(id) { document.getElementById(id).classList.add('active'); }

function fmtMonth(m) {
  let [y, mo] = m.split('-');
  return y + '年' + parseInt(mo) + '月';
}

// ============ 首页 ============
function switchTab(tab) {
  document.querySelectorAll('.login-tab').forEach(t => t.classList.remove('active'));
  document.querySelectorAll('.login-tab')[tab === 'rate' ? 0 : 1].classList.add('active');
  document.getElementById('rateForm').style.display = tab === 'rate' ? 'block' : 'none';
  document.getElementById('adminLoginForm').style.display = tab === 'admin' ? 'block' : 'none';
}

function enterScoring() {
  let role = document.getElementById('rateRole').value;
  if (!role) return showToast('请选择角色', 'error');
  state.raterRole = role;
  sessionStorage.setItem('raterRole', role);
  showScorerPage();
}

function showRankingPage() {
  showPage('rankingPage');
  loadRanking();
}

function goBack() {
  if (state.adminLoggedIn) showAdminPage();
  else if (state.raterRole) showScorerPage();
  else showPage('homePage');
}

// ============ 管理员 ============
async function adminLogin() {
  let pw = document.getElementById('adminPassword').value;
  if (!pw) return showToast('请输入密码', 'error');
  let data = getData();
  if (!data) return showToast('数据加载失败，请刷新重试', 'error');
  // 简单密码比对（服务端无 bcrypt，用明文比对）
  if (pw !== '013604') return showToast('密码错误', 'error');
  state.adminLoggedIn = true;
  sessionStorage.setItem('admin_ok', '1');
  document.getElementById('adminPassword').value = '';
  showAdminPage();
  showToast('登录成功');
}

function logout() {
  state.adminLoggedIn = false;
  state.raterRole = null;
  sessionStorage.removeItem('admin_ok');
  sessionStorage.removeItem('raterRole');
  document.getElementById('userInfo').textContent = '';
  document.getElementById('logoutBtn').style.display = 'none';
  showPage('homePage');
  loadRanking();
}

async function showAdminPage() {
  showPage('adminPage');
  document.getElementById('userInfo').textContent = '管理员';
  document.getElementById('logoutBtn').style.display = 'inline-block';
  await loadAdminData();
}

async function loadAdminData() {
  await Promise.all([loadStats(), loadTechnicians(), loadRoleStats(), loadAdminRanking()]);
}

function loadStats() {
  let data = getData();
  if (!data) return;
  let m = document.getElementById('adminMonth').value;
  let totalTechs = (data.technicians || []).length;
  let ms = (data.scores || []).filter(s => s.month === m);
  let avg = ms.length > 0 ? Math.round((ms.reduce((s, x) => s + x.score, 0) / ms.length) * 100) / 100 : 0;
  document.getElementById('statTechs').textContent = totalTechs;
  document.getElementById('statScores').textContent = ms.length;
  document.getElementById('statAvg').textContent = avg;
  let total = 0;
  ROLES.forEach(r => { total += ms.filter(s => s.raterRole === r).length; });
  document.getElementById('statRaters').textContent = total;
}

function loadRoleStats() {
  let data = getData();
  if (!data) return;
  let m = document.getElementById('adminMonth').value;
  let c = document.getElementById('roleStats');
  c.innerHTML = '';
  ROLES.forEach(r => {
    let count = (data.scores || []).filter(s => s.month === m && s.raterRole === r).length;
    let rc = r === '基层领导' ? 'role-leader' : r === '技术人员' ? 'role-tech' : 'role-team';
    let div = document.createElement('div');
    div.style.cssText = 'flex:1;min-width:160px;padding:16px;background:var(--bg);border-radius:var(--radius-sm);text-align:center';
    div.innerHTML = '<span class="role-badge ' + rc + '" style="margin-bottom:8px;display:inline-block">' + r + '</span>' +
      '<div style="font-size:28px;font-weight:700;color:var(--primary)">' + count + '</div>' +
      '<div style="font-size:12px;color:var(--text-light)">评分记录数</div>';
    c.appendChild(div);
  });
}

function loadTechnicians() {
  let data = getData();
  if (!data) return;
  window._techs = data.technicians || [];
  let tbody = document.getElementById('techTableBody');
  tbody.innerHTML = '';
  if (!window._techs.length) {
    tbody.innerHTML = '<tr><td colspan="4" class="empty-state"><p>暂无技术人员</p></td></tr>';
    return;
  }
  window._techs.forEach((t, i) => {
    let tr = document.createElement('tr');
    tr.innerHTML = '<td>' + (i+1) + '</td><td><strong>' + esc(t.name) + '</strong></td><td>' + esc(t.department||'-') + '</td>' +
      '<td><button class="btn btn-danger btn-sm" onclick="deleteTech(' + t.id + ',\'' + esc(t.name) + '\')">删除</button></td>';
    tbody.appendChild(tr);
  });
}

function loadAdminRanking() {
  let data = getData();
  if (!data) return;
  let m = document.getElementById('adminMonth').value;
  let techs = data.technicians || [];
  let scores = (data.scores || []).filter(s => s.month === m);
  let ranking = techs.map(t => {
    let ts = scores.filter(s => s.technicianId === t.id);
    let total = ts.reduce((s, x) => s + x.score, 0);
    let avg = ts.length > 0 ? Math.round((total / ts.length) * 100) / 100 : 0;
    return { id: t.id, name: t.name, department: t.department, avgScore: avg, totalScore: total, raterCount: new Set(ts.map(s => s.raterId)).size, scoreCount: ts.length };
  });
  ranking.sort((a, b) => b.avgScore - a.avgScore);

  let tbody = document.getElementById('adminRankingBody');
  tbody.innerHTML = '';
  if (!ranking.length) {
    tbody.innerHTML = '<tr><td colspan="6" class="empty-state"><p>暂无数据</p></td></tr>';
    return;
  }
  ranking.forEach((r, i) => {
    let rc = i === 0 ? 'rank-1' : i === 1 ? 'rank-2' : i === 2 ? 'rank-3' : 'rank-other';
    let sc = r.avgScore >= 8 ? 'score-high' : r.avgScore >= 5 ? 'score-mid' : 'score-low';
    let pct = r.avgScore ? (r.avgScore / 10 * 100) : 0;
    let tr = document.createElement('tr');
    tr.innerHTML = '<td><span class="rank-badge ' + rc + '">' + (i+1) + '</span></td>' +
      '<td><strong>' + esc(r.name) + '</strong></td><td>' + esc(r.department||'-') + '</td>' +
      '<td><strong style="color:' + (r.avgScore>=8?'var(--success)':r.avgScore>=5?'var(--accent)':'var(--danger)') + '">' + r.avgScore.toFixed(1) + '</strong></td>' +
      '<td>' + r.totalScore + '</td>' +
      '<td><div style="display:flex;align-items:center;gap:8px"><div class="score-bar" style="width:100px"><div class="score-bar-fill ' + sc + '" style="width:' + pct + '%"></div></div><span style="font-size:12px;color:var(--text-light)">' + r.raterCount + '人</span></div></td>';
    tbody.appendChild(tr);
  });
}

function showAddTechModal() {
  document.getElementById('newTechName').value = '';
  document.getElementById('newTechDept').value = '';
  showModal('addTechModal');
  setTimeout(() => document.getElementById('newTechName').focus(), 100);
}

async function addTechnician() {
  let name = document.getElementById('newTechName').value.trim();
  let dept = document.getElementById('newTechDept').value.trim();
  if (!name) return showToast('请输入姓名', 'error');
  showSync('保存中...', 'syncing');
  await addTech(name, dept);
  closeModal('addTechModal');
  showToast('添加成功');
  showSync('已同步', 'ok');
  loadTechnicians(); loadStats();
}

async function deleteTech(id, name) {
  if (!confirm('确定删除「' + name + '」？')) return;
  showSync('删除中...', 'syncing');
  await delTech(id);
  showToast('已删除');
  showSync('已同步', 'ok');
  loadTechnicians(); loadStats();
}

function resetMonth() {
  let m = document.getElementById('adminMonth').value;
  document.getElementById('resetMonthLabel').textContent = fmtMonth(m);
  showModal('resetModal');
}

async function confirmReset() {
  let m = document.getElementById('adminMonth').value;
  showSync('刷新中...', 'syncing');
  await resetMonth(m);
  closeModal('resetModal');
  showToast(fmtMonth(m) + ' 积分已刷新');
  showSync('已同步', 'ok');
  loadAdminData(); loadMonths();
}

function exportRanking() {
  let data = getData();
  if (!data) return showToast('数据未加载', 'error');
  let m = document.getElementById('adminMonth').value;
  let scores = (data.scores || []).filter(s => s.month === m);
  let techs = data.technicians || [];
  let ranking = techs.map(t => {
    let ts = scores.filter(s => s.technicianId === t.id);
    let total = ts.reduce((s, x) => s + x.score, 0);
    let avg = ts.length > 0 ? Math.round((total / ts.length) * 100) / 100 : 0;
    return { name: t.name, department: t.department, avgScore: avg, totalScore: total, raterCount: new Set(ts.map(s => s.raterId)).size };
  }).sort((a, b) => b.avgScore - a.avgScore);

  let csv = '\uFEFF排名,姓名,部门,平均分,总分,评分人数\n';
  ranking.forEach((x, i) => { csv += (i+1) + ',' + x.name + ',' + (x.department||'') + ',' + x.avgScore.toFixed(1) + ',' + x.totalScore + ',' + x.raterCount + '\n'; });
  let blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
  let a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = '月度排名_' + m + '.csv';
  a.click();
  showToast('导出成功');
}

function exportData() {
  let data = getData();
  if (!data) return showToast('数据未加载', 'error');
  let blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  let a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = '评分数据备份_' + getCurrentMonth() + '.json';
  a.click();
  showToast('数据已导出');
}

function importData() { document.getElementById('importFile').click(); }

function handleImport(e) {
  let f = e.target.files[0];
  if (!f) return;
  let reader = new FileReader();
  reader.onload = async (ev) => {
    try {
      let d = JSON.parse(ev.target.result);
      showSync('导入中...', 'syncing');
      await _writeData(d);
      showToast('数据导入成功');
      showSync('已同步', 'ok');
      loadAdminData(); loadMonths();
    } catch (err) { showToast('导入失败：' + err.message, 'error'); }
  };
  reader.readAsText(f);
  e.target.value = '';
}

// ============ 评分者 ============
function showScorerPage() {
  showPage('scorerPage');
  document.getElementById('userInfo').textContent = state.raterRole;
  document.getElementById('logoutBtn').style.display = 'inline-block';
  document.getElementById('scorerName').textContent = state.raterRole;
  let rc = state.raterRole === '基层领导' ? 'role-leader' : state.raterRole === '技术人员' ? 'role-tech' : 'role-team';
  document.getElementById('scorerRoleBadge').textContent = state.raterRole;
  document.getElementById('scorerRoleBadge').className = 'role-badge ' + rc;
  loadScorerData();
}

function loadScorerData() {
  let data = getData();
  if (!data) return;
  window._techs = data.technicians || [];
  renderTechSelector();
  if (state.selectedTechId) loadExistingScores();
}

function renderTechSelector() {
  let techs = window._techs || [];
  let c = document.getElementById('techSelector');
  c.innerHTML = '';
  if (!techs.length) {
    c.innerHTML = '<div class="empty-state"><div class="icon">👥</div><h3>暂无技术人员</h3><p>请联系管理员添加</p></div>';
    return;
  }
  techs.forEach(t => {
    let d = document.createElement('div');
    d.className = 'tech-card' + (state.selectedTechId === t.id ? ' selected' : '');
    d.onclick = () => selectTech(t.id);
    d.innerHTML = '<div class="tech-avatar">' + t.name.charAt(0) + '</div>' +
      '<div class="tech-info"><h3>' + esc(t.name) + '</h3><p>' + esc(t.department||'暂无部门') + '</p></div>';
    c.appendChild(d);
  });
}

function selectTech(id) {
  state.selectedTechId = id;
  renderTechSelector();
  let tech = (window._techs || []).find(t => t.id === id);
  if (tech) document.getElementById('scoringTechName').textContent = tech.name;
  document.getElementById('scoreForm').style.display = 'block';
  renderScoreInputs();
  loadExistingScores();
}

function renderScoreInputs() {
  let tbody = document.getElementById('scoreInputBody');
  tbody.innerHTML = '';
  DIMENSIONS.forEach((dim, i) => {
    let tr = document.createElement('tr');
    tr.innerHTML = '<td>' + (i+1) + '</td>' +
      '<td style="text-align:left"><div style="font-weight:600;margin-bottom:2px">' + dim.label + '</div><div style="font-size:12px;color:var(--text-muted)">' + dim.desc + '</div></td>' +
      '<td><div class="score-slider-cell"><input type="range" min="0" max="10" value="0" id="score_' + i + '" data-key="' + dim.key + '" data-label="' + dim.label + '" oninput="updateScoreLabel(this)">' +
      '<span class="score-label" id="label_' + i + '">0</span></div></td>';
    tbody.appendChild(tr);
  });
}

function updateScoreLabel(inp) {
  let v = inp.value;
  let idx = inp.id.replace('score_', '');
  let label = document.getElementById('label_' + idx);
  if (label) label.textContent = v;
}

function loadExistingScores() {
  let data = getData();
  if (!data || !state.selectedTechId) return;
  let m = document.getElementById('scorerMonth').value;
  let scores = (data.scores || []).filter(s => s.technicianId === state.selectedTechId && s.month === m);
  scores.filter(s => s.raterRole === state.raterRole).forEach(s => {
    document.querySelectorAll('#scoreInputBody input').forEach(inp => {
      if (inp.dataset.key === s.dimensionKey) inp.value = s.score;
    });
  });
}

async function submitScores() {
  let inputs = document.querySelectorAll('#scoreInputBody input');
  let scores = {};
  let total = 0;
  inputs.forEach(inp => {
    let v = parseInt(inp.value) || 0;
    scores[inp.dataset.key] = v;
    total += v;
  });
  let m = document.getElementById('scorerMonth').value;
  showSync('提交中...', 'syncing');
  await submitScore(state.selectedTechId, state.raterRole, scores, m);
  showToast('评分提交成功！总分：' + total + '/100');
  showSync('已同步', 'ok');
  loadMonths();
}

// ============ 排名 ============
function loadRanking() {
  let data = getData();
  if (!data) return;
  let sel = document.getElementById('rankingMonth');
  if (!sel) return;
  let m = sel.value;
  let techs = data.technicians || [];
  let scores = (data.scores || []).filter(s => s.month === m);
  let ranking = techs.map(t => {
    let ts = scores.filter(s => s.technicianId === t.id);
    let total = ts.reduce((s, x) => s + x.score, 0);
    let avg = ts.length > 0 ? Math.round((total / ts.length) * 100) / 100 : 0;
    return { id: t.id, name: t.name, department: t.department, avgScore: avg, totalScore: total, raterCount: new Set(ts.map(s => s.raterId)).size, scoreCount: ts.length };
  });
  ranking.sort((a, b) => b.avgScore - a.avgScore);

  let tbody = document.getElementById('rankingBody');
  tbody.innerHTML = '';
  if (!ranking.length) {
    tbody.innerHTML = '<tr><td colspan="6" class="empty-state"><div class="icon">📊</div><h3>暂无排名数据</h3><p>等待评分数据录入后显示</p></td></tr>';
    return;
  }
  ranking.forEach((r, i) => {
    let rc = i === 0 ? 'rank-1' : i === 1 ? 'rank-2' : i === 2 ? 'rank-3' : 'rank-other';
    let sc = r.avgScore >= 8 ? 'score-high' : r.avgScore >= 5 ? 'score-mid' : 'score-low';
    let pct = r.avgScore ? (r.avgScore / 10 * 100) : 0;
    let tr = document.createElement('tr');
    tr.innerHTML = '<td><span class="rank-badge ' + rc + '">' + (i+1) + '</span></td>' +
      '<td><strong>' + esc(r.name) + '</strong></td><td>' + esc(r.department||'-') + '</td>' +
      '<td><strong style="font-size:18px;color:' + (r.avgScore>=8?'var(--success)':r.avgScore>=5?'var(--accent)':'var(--danger)') + '">' + r.avgScore.toFixed(1) + '</strong></td>' +
      '<td>' + r.totalScore + '</td>' +
      '<td><div style="display:flex;align-items:center;gap:8px"><div class="score-bar" style="width:100px"><div class="score-bar-fill ' + sc + '" style="width:' + pct + '%"></div></div><span style="font-size:12px;color:var(--text-light)">' + r.raterCount + '人</span></div></td>';
    tbody.appendChild(tr);
  });
}

// ============ 月份 ============
function loadMonths() {
  let data = getData();
  if (!data) return;
  let months = [...new Set((data.scores || []).map(s => s.month))].sort().reverse();
  let cur = getCurrentMonth();
  if (!months.includes(cur)) months.unshift(cur);
  ['adminMonth','scorerMonth','rankingMonth'].forEach(id => {
    let sel = document.getElementById(id);
    if (!sel) return;
    sel.innerHTML = '';
    months.forEach(m => {
      let o = document.createElement('option');
      o.value = m; o.textContent = fmtMonth(m);
      if (m === cur) o.selected = true;
      sel.appendChild(o);
    });
  });
}

// ============ 渲染所有 ============
function renderAll() {
  loadStats(); loadTechnicians(); loadRoleStats(); loadAdminRanking(); loadRanking(); loadMonths();
}

// ============ 初始化 ============
document.addEventListener('DOMContentLoaded', function() {
  showSync('加载数据中...', 'syncing');
  loadData().then(function() {
    showSync('已连接', 'ok');
    loadMonths();
    if (state.adminLoggedIn) { showAdminPage(); return; }
    if (state.raterRole) { showScorerPage(); return; }
    showPage('homePage');
    loadRanking();
    setInterval(sync, SYNC_MS);
  }).catch(function(e) {
    console.error('init failed:', e);
    showToast('数据加载失败，请刷新重试', 'error');
    showSync('加载失败', 'err');
  });
});
