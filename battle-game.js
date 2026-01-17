const SUPABASE_URL = 'https://utfrjzcnefsbuadnkdud.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InV0ZnJqemNuZWZzYnVhZG5rZHVkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjY4MjE1MTYsImV4cCI6MjA4MjM5NzUxNn0.D3Za1nMw-x0JwOpkFuYceUHlagcpRdrpFqNUIP5Kjdc';
const supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

const qs = new URLSearchParams(location.search);
const battleId = qs.get('battleId');

let me = null;
let battle = null;
let state = null;

function clamp(n, min, max) {
  return Math.max(min, Math.min(max, n));
}

function randInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function isMyTurn() {
  return battle && me && battle.current_turn === me.id && battle.status === 'in_progress';
}

function render() {
  if (!battle || !state) return;

  const p1 = state.p1;
  const p2 = state.p2;

  document.getElementById('title').textContent = `${p1.name} vs ${p2.name}`;

  document.getElementById('p1Name').textContent = p1.name;
  document.getElementById('p1Lvl').textContent = `Lv.${p1.level}`;
  document.getElementById('p1Atk').textContent = p1.attack;
  document.getElementById('p1Hp').textContent = `${p1.hp} / ${p1.maxHp}`;
  document.getElementById('p1HpBar').style.width = `${Math.floor((p1.hp / p1.maxHp) * 100)}%`;

  document.getElementById('p2Name').textContent = p2.name;
  document.getElementById('p2Lvl').textContent = `Lv.${p2.level}`;
  document.getElementById('p2Atk').textContent = p2.attack;
  document.getElementById('p2Hp').textContent = `${p2.hp} / ${p2.maxHp}`;
  document.getElementById('p2HpBar').style.width = `${Math.floor((p2.hp / p2.maxHp) * 100)}%`;

  const p1Card = document.getElementById('p1Card');
  const p2Card = document.getElementById('p2Card');
  p1Card.classList.remove('active');
  p2Card.classList.remove('active');

  if (battle.current_turn === p1.id) p1Card.classList.add('active');
  if (battle.current_turn === p2.id) p2Card.classList.add('active');

  const turnPill = document.getElementById('turnPill');
  if (battle.status !== 'in_progress') {
    if (battle.status === 'completed') {
      turnPill.textContent = battle.winner_id === me.id ? '승리' : '패배';
    } else {
      turnPill.textContent = battle.status;
    }
  } else {
    turnPill.textContent = isMyTurn() ? '내 턴' : '상대 턴';
  }

  const logEl = document.getElementById('log');
  const logs = Array.isArray(state.log) ? state.log : [];
  logEl.innerHTML = logs.map(l => `<div style="padding:6px 0; border-bottom:1px solid rgba(255,255,255,0.06);">${l}</div>`).join('');
  logEl.scrollTop = logEl.scrollHeight;

  document.getElementById('attackBtn').disabled = !isMyTurn();
}

async function requireSession() {
  const { data: { session } } = await supabaseClient.auth.getSession();
  if (!session) { location.href = 'login.html'; return null; }
  me = session.user;
  return session;
}

async function loadBattle() {
  if (!battleId) throw new Error('battleId가 없습니다.');

  const { data, error } = await supabaseClient
    .from('battles')
    .select('*')
    .eq('id', battleId)
    .single();

  if (error) throw error;
  battle = data;
  state = battle.state || {};
  render();
}

async function applyAttack() {
  if (!isMyTurn()) return;

  const p1 = { ...state.p1 };
  const p2 = { ...state.p2 };

  const attacker = (me.id === p1.id) ? p1 : p2;
  const defender = (me.id === p1.id) ? p2 : p1;

  const variance = randInt(-2, 4);
  const dmg = clamp(attacker.attack + variance, 1, 9999);
  defender.hp = clamp(defender.hp - dmg, 0, defender.maxHp);

  const newLog = Array.isArray(state.log) ? [...state.log] : [];
  newLog.push(`${attacker.name}의 공격! ${defender.name}에게 ${dmg} 데미지`);

  let status = 'in_progress';
  let winnerId = null;
  let nextTurn = defender.id;

  if (defender.hp <= 0) {
    status = 'completed';
    winnerId = attacker.id;
    nextTurn = attacker.id;
    newLog.push(`승리: ${attacker.name}`);
  }

  const newState = {
    ...state,
    log: newLog,
    p1: (p1.id === attacker.id) ? attacker : defender,
    p2: (p2.id === attacker.id) ? attacker : defender
  };

  const { data: updated, error } = await supabaseClient
    .from('battles')
    .update({
      state: newState,
      status,
      current_turn: nextTurn,
      winner_id: winnerId
    })
    .eq('id', battleId)
    .eq('current_turn', me.id)
    .select()
    .single();

  if (error) {
    await loadBattle();
    return;
  }

  battle = updated;
  state = updated.state;

  if (status === 'completed') {
    try {
      await bumpProgressOnWin(winnerId === me.id);
    } catch (_) {}
  }

  render();
}

async function upsertUserMission(userId, missionId, inc) {
  const { data: row } = await supabaseClient
    .from('user_missions')
    .select('progress, completed, claimed')
    .eq('user_id', userId)
    .eq('mission_id', missionId)
    .maybeSingle();

  let progress = (row?.progress || 0) + inc;

  const { data: def } = await supabaseClient
    .from('missions')
    .select('target')
    .eq('id', missionId)
    .maybeSingle();

  const target = def?.target || 1;
  const completed = progress >= target;

  await supabaseClient
    .from('user_missions')
    .upsert({ user_id: userId, mission_id: missionId, progress, completed, claimed: row?.claimed || false });
}

async function upsertUserAchievement(userId, achievementId, inc) {
  const { data: row } = await supabaseClient
    .from('user_achievements')
    .select('progress, unlocked')
    .eq('user_id', userId)
    .eq('achievement_id', achievementId)
    .maybeSingle();

  let progress = (row?.progress || 0) + inc;

  const { data: def } = await supabaseClient
    .from('achievements')
    .select('target')
    .eq('id', achievementId)
    .maybeSingle();

  const target = def?.target || 1;
  const unlocked = progress >= target;

  await supabaseClient
    .from('user_achievements')
    .upsert({ user_id: userId, achievement_id: achievementId, progress, unlocked, unlocked_at: unlocked ? new Date().toISOString() : null });
}

async function bumpProgressOnWin(isWin) {
  if (!me) return;

  await upsertUserMission(me.id, 'battle_play_1', 1);
  if (isWin) await upsertUserMission(me.id, 'battle_win_1', 1);

  if (isWin) await upsertUserAchievement(me.id, 'wins_10', 1);
}

async function init() {
  await requireSession();
  await loadBattle();

  document.getElementById('attackBtn').addEventListener('click', async () => {
    try { await applyAttack(); }
    catch (e) { alert('공격 실패: ' + (e?.message || e)); }
  });

  document.getElementById('refreshBtn').addEventListener('click', async () => {
    try { await loadBattle(); }
    catch (e) { alert('새로고침 실패: ' + (e?.message || e)); }
  });

  setInterval(() => loadBattle().catch(() => {}), 5000);
}

init().catch(e => alert('초기화 오류: ' + (e?.message || e)));
