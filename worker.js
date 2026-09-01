export default {
  async fetch(request, env) {
    const url = new URL(request.url);

// 🔐 하드코딩 관리자 PIN 
const ADMIN_PIN = '4433';
// 📢 디스코드 웹훅 URL (본인의 디스코드 채널 웹훅 URL을 입력하세요)
const DISCORD_WEBHOOK_URL = env.DISCORD_WEBHOOK_URL || 'https://discord.com/api/webhooks/1542454716997443594/pFHCm6WwhzDlNba7vPV9tStgiGSpqeG3AYXyc-mtJ5ReHwstVUREPExYJS_zu3qPSX7_';

// 공통 CORS 헤더
const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET,POST,DELETE,OPTIONS', // ← DELETE 추가
  'Access-Control-Allow-Headers': 'Content-Type',
};


// 🔑 라이엇 Personal API Key
const RIOT_API_KEY = 'RGAPI-fdb5f6b0-d42b-4596-986c-4b5fc1d12a92';

// POST /api/results
// body: { blue:[5 ids], red:[5 ids], winner: 'blue'|'red', season?: string }
if (url.pathname === "/api/results" && request.method === "POST") {
  try {
    const CORS = {
      "access-control-allow-origin": "*",
      "access-control-allow-headers": "content-type",
      "access-control-allow-methods": "GET,POST,DELETE,OPTIONS",
    };

    const b = await request.json();
    // 검증
    const isArr5 = (a) => Array.isArray(a) && a.length === 5 && a.every(x => Number.isInteger(Number(x)) && Number(x) > 0);
    if (!isArr5(b.blue) || !isArr5(b.red)) {
      return new Response(JSON.stringify({ error: "blue/red must be arrays of 5 positive integer ids" }), { status:400, headers:{ "content-type":"application/json", ...CORS }});
    }
    if (!['blue','red'].includes(b.winner)) {
      return new Response(JSON.stringify({ error: "winner must be 'blue' or 'red'" }), { status:400, headers:{ "content-type":"application/json", ...CORS }});
    }

    const blueIds = b.blue.map(Number);
    const redIds  = b.red.map(Number);
    const resultVal = (b.winner === 'blue') ? 1 : 2;
    // 기본값은 '2026-2' (시즌 2 시작 시)
    const currentSeason = b.season || '2026-2';

    // 1) results 테이블에 1줄 추가 (season 컬럼 포함)
    await env.DB.prepare(`
      INSERT INTO results
      (blue1,blue2,blue3,blue4,blue5, red1,red2,red3,red4,red5, result, season)
      VALUES (?,?,?,?,?, ?,?,?,?,?, ?, ?)
    `).bind(...blueIds, ...redIds, resultVal, currentSeason).run();

    // 2) players 업데이트 (승리 +1, 패배 +1, rating ±1, last_updated 갱신)
    const winners = (resultVal === 1) ? blueIds : redIds;
    const losers  = (resultVal === 1) ? redIds  : blueIds;

    // 승자: win+1, rating+1
    await env.DB.prepare(`
      UPDATE players
         SET win = win + 1,
             rating = rating + 1,
             last_updated = CURRENT_TIMESTAMP
       WHERE id IN (?,?,?,?,?)
    `).bind(...winners).run();

    // 패자: loose+1, rating-1
    await env.DB.prepare(`
      UPDATE players
         SET loose = loose + 1,
             rating = rating - 1,
             last_updated = CURRENT_TIMESTAMP
       WHERE id IN (?,?,?,?,?)
    `).bind(...losers).run();

    // 최신 기록 반환
    const row = await env.DB.prepare(`SELECT * FROM results ORDER BY id DESC LIMIT 1`).first();
    return new Response(JSON.stringify({ ok:true, result: row }), { headers:{ "content-type":"application/json", ...CORS }});

  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), {
      status: 500,
      headers: { "content-type": "application/json",
                 "access-control-allow-origin": "*",
                 "access-control-allow-headers": "content-type",
                 "access-control-allow-methods": "GET,POST,DELETE,OPTIONS" }
    });
  }
}


// JSON 응답 헬퍼
function json(data, status = 200, extra = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', ...CORS, ...extra }, // ← 스프레드(...), 점(.) 아님
  });
}

// 기존 json 헬퍼 근처에 추가해 주세요.
function getNowStr(addMs = 0) {
  const d = new Date(Date.now() + addMs);
  return d.toISOString().slice(0, 19).replace('T', ' ');
}

// --- CORS 프리플라이트 (모든 경로 공통) ---
// --- CORS 프리플라이트 (모든 경로 공통) ---
if (request.method === 'OPTIONS') {
  return new Response(null, {
    status: 204,
    headers: {
      'access-control-allow-origin': '*',
      'access-control-allow-headers': 'content-type, x-admin-pin', // ← 커스텀 헤더 허용
      'access-control-allow-methods': 'GET,POST,DELETE,PATCH,OPTIONS',
    },
  });
}




    // 헬스체크
    if (url.pathname === "/api/health") {
      return new Response(JSON.stringify({ ok: true }), {
        headers: { "content-type": "application/json", ...CORS },
      });
    }


    
// ==========================================
// 👥 GET /api/users (시즌별 실시간 연산 - 2026-2 전적 및 판수 완벽 반영)
// ==========================================
if (url.pathname === "/api/users" && request.method === "GET") {
  const CORS = {
    "access-control-allow-origin": "*",
    "access-control-allow-headers": "content-type",
    "access-control-allow-methods": "GET,POST,DELETE,OPTIONS",
  };

  const season = url.searchParams.get("season") || "2026-2";
  const showAll = url.searchParams.get("show_all") === "true";

  let playerQuery = `
    SELECT id, user_id, rating_start, position_main, position_sub, active, 
           stat_vote, stat_1, stat_2, stat_3, stat_4, stat_5, stat_6, 
           created_at, last_updated,
           riot_id_1, riot_id_2, riot_id_3
    FROM players 
  `;
  if (!showAll) playerQuery += ` WHERE active = 1 `;
  playerQuery += ` ORDER BY id`;

  const playersPromise = env.DB.prepare(playerQuery).all();
  const resultsPromise = env.DB.prepare(`SELECT * FROM results ORDER BY id ASC`).all();
  const [pData, rData] = await Promise.all([playersPromise, resultsPromise]);

  const players = pData.results || [];
  const allMatches = rData.results || [];

  // 1) 2026-1 순수 전적 계산 (2026-01-01 ~ 2026-07-27)
  const s2026_1 = {};
  players.forEach(p => { s2026_1[p.id] = { win: 0, loose: 0 }; });

  for (const m of allMatches) {
    const isS1 = (m.season === '2026-1') || (!m.season && m.time >= '2026-01-01' && m.time < '2026-07-28');
    if (isS1) {
      const isBlueWin = (m.result === 1);
      const winners = isBlueWin ? [m.blue1,m.blue2,m.blue3,m.blue4,m.blue5] : [m.red1,m.red2,m.red3,m.red4,m.red5];
      const losers  = isBlueWin ? [m.red1,m.red2,m.red3,m.red4,m.red5] : [m.blue1,m.blue2,m.blue3,m.blue4,m.blue5];
      winners.forEach(id => { if (s2026_1[id]) s2026_1[id].win += 1; });
      losers.forEach(id  => { if (s2026_1[id]) s2026_1[id].loose += 1; });
    }
  }

  // 2) 시즌별 시작 점수(rating_start) 결정
  const stats = {};
  players.forEach(p => {
    let baseRating = 0;
    if (season === '2026-2') {
      const p1 = s2026_1[p.id] || { win:0, loose:0 };
      baseRating = p1.win - p1.loose;
    } else {
      baseRating = p.rating_start || 0;
    }

    stats[p.id] = {
      win: 0,
      loose: 0,
      rating_start: baseRating,
      current_rating: baseRating
    };
  });

  // 3) 💡 [버그 해결] 선택된 시즌 경기 필터링 (시즌2: season='2026-2' 또는 2026-07-28 이후 모든 경기)
  const targetMatches = allMatches.filter(m => {
    if (season === '2026-2') {
      return (m.season === '2026-2') || (!m.season && m.time >= '2026-07-28') || (!m.season && !m.time);
    }
    if (season === '2026-1' || season === '2026') {
      return (m.season === '2026-1') || (!m.season && m.time >= '2026-01-01' && m.time < '2026-07-28');
    }
    if (season === '2025') {
      return (m.season === '2025') || (!m.season && m.time < '2026-01-01');
    }
    return true;
  });

  for (const m of targetMatches) {
    const isBlueWin = (m.result === 1);
    const winners = isBlueWin ? [m.blue1,m.blue2,m.blue3,m.blue4,m.blue5] : [m.red1,m.red2,m.red3,m.red4,m.red5];
    const losers  = isBlueWin ? [m.red1,m.red2,m.red3,m.red4,m.red5] : [m.blue1,m.blue2,m.blue3,m.blue4,m.blue5];

    winners.forEach(id => { if (stats[id]) { stats[id].win += 1; stats[id].current_rating += 1; } });
    losers.forEach(id  => { if (stats[id]) { stats[id].loose += 1; stats[id].current_rating -= 1; } });
  }

  // 4) 계산 결과 반환 (현재 시즌 win/loose가 100% 정상 출력됨)
  const finalResults = players.map(p => {
    const s = stats[p.id];
    const p1 = s2026_1[p.id] || { win: 0, loose: 0 };
    return {
      ...p,
      win: s.win,
      loose: s.loose,
      rating_start: s.rating_start,
      rating: s.current_rating,
      prev_win: p1.win,
      prev_loose: p1.loose
    };
  });

  return new Response(JSON.stringify(finalResults), {
    headers: { "content-type": "application/json", ...CORS }
  });
}




    // 유저 추가
// POST /api/users  body: { user_id|userId, rating, rating_start?, position_main?, position_sub? }
if (url.pathname === '/api/users' && request.method === 'POST') {
  const CORS = {
    'access-control-allow-origin': '*',
    'access-control-allow-headers': 'content-type',
    'access-control-allow-methods': 'GET,POST,DELETE,OPTIONS',
  };

  try {
    const body = await request.json();
    const user_id = (body.user_id ?? body.userId ?? '').trim();
    let rating = Number(body.rating ?? 0);
    if (!user_id) {
      return new Response(JSON.stringify({ error: 'bad_user_id' }), {
        status: 400, headers: { 'content-type': 'application/json', ...CORS }
      });
    }
    if (!Number.isFinite(rating)) rating = 0;

    // 초기점수 = 최초 rating (클라가 rating_start 안 보내도 자동 보정)
    let rating_start = Number(body.rating_start);
    if (!Number.isFinite(rating_start)) rating_start = rating;

    const now = new Date().toISOString().slice(0,19).replace('T',' ');
    const position_main = (body.position_main ?? '').trim();
    const position_sub  = (body.position_sub  ?? '').trim();

    const ins = await env.DB.prepare(
      `INSERT INTO players (user_id, rating, rating_start, created_at, last_updated, win, loose, position_main, position_sub)
       VALUES (?, ?, ?, ?, ?, 0, 0, ?, ?)`
    ).bind(user_id, rating, rating_start, now, now, position_main, position_sub).run();

    // ✅ D1 버전별로 달라질 수 있는 삽입 ID를 안전하게 얻기
    const insertedId =
      ins?.lastRowId ??
      ins?.lastRowID ??
      ins?.meta?.last_row_id ??
      ins?.meta?.lastRowId ?? null;

    // ✅ 삽입 ID가 없으면 user_id로 조회 폴백 (user_id UNIQUE 보장)
    let row;
    if (insertedId != null) {
      row = await env.DB.prepare(
        `SELECT id, user_id, rating, rating_start, win, loose, created_at, last_updated, position_main, position_sub
         FROM players WHERE id = ?`
      ).bind(insertedId).first();
    } else {
      row = await env.DB.prepare(
        `SELECT id, user_id, rating, rating_start, win, loose, created_at, last_updated, position_main, position_sub
         FROM players WHERE user_id = ? ORDER BY id DESC LIMIT 1`
      ).bind(user_id).first();
    }

    return new Response(JSON.stringify({ ok: true, user: row }), {
      status: 201, headers: { 'content-type': 'application/json', ...CORS }
    });

  } catch (e) {
    const msg = String(e?.message || e);
    // 중복일 때는 409로
    if (msg.includes('UNIQUE') && msg.includes('players.user_id')) {
      return new Response(JSON.stringify({ error: 'duplicate_user', field: 'user_id' }), {
        status: 409, headers: { 'content-type': 'application/json', ...CORS }
      });
    }
    // 기타 에러는 그대로 반환(디버깅용 detail 포함)
    return new Response(JSON.stringify({ error: 'insert_failed', detail: msg }), {
      status: 500, headers: { 'content-type': 'application/json', ...CORS }
    });
  }
}






// 🔹 /api/users/all → 모든 유저 (비활성 포함)
if (url.pathname === "/api/users/all" && request.method === "GET") {
  const { results } = await env.DB.prepare(`
    SELECT
      id, user_id, rating, rating_start, win, loose,
      created_at, last_updated, position_main, position_sub,
      stat_vote, stat_1, stat_2, stat_3, stat_4, stat_5, stat_6,
      active,
      riot_id_1, riot_id_2, riot_id_3 -- ✅ 라이엇 ID 컬럼 추가
    FROM players
  WHERE active = 1
  ORDER BY id
  `).all();
  return new Response(JSON.stringify(results), {
    headers: { "content-type": "application/json", ...CORS }
  });
}



// POST /api/results/auto → LCU 업로더 경기 자동 등록 (+ 피어리스 자동 밴 연동)
if (url.pathname === '/api/results/auto' && request.method === 'POST') {
  try {
    const body = await request.json();
    const { game_id, game_duration, game_time, winner, blue, red, match_detail } = body;
    const currentSeason = body.season || '2026-2';

    // 1) 필수 데이터 검증 (5:5)
    if (!Array.isArray(blue) || blue.length !== 5 || !Array.isArray(red) || red.length !== 5) {
      return json({ error: 'blue and red must be arrays of 5 IDs' }, 400);
    }
    if (!['blue', 'red'].includes(winner)) {
      return json({ error: 'winner must be blue or red' }, 400);
    }

    // 2) 중복 등록 방지 (game_id 기준)
    if (game_id) {
      const existing = await env.DB.prepare(`SELECT id FROM results WHERE game_id = ?`).bind(String(game_id)).first();
      if (existing) {
        return json({ ok: true, duplicate: true, message: 'Game already recorded', id: existing.id });
      }
    }

    const resultVal = (winner === 'blue') ? 1 : 2;
    const blueIds = blue.map(Number);
    const redIds  = red.map(Number);
    const detailJson = match_detail ? JSON.stringify(match_detail) : null;

    // 3) results 테이블 INSERT
    let ins;
    if (game_time) {
      ins = await env.DB.prepare(`
        INSERT INTO results
        (blue1, blue2, blue3, blue4, blue5, red1, red2, red3, red4, red5, result, game_id, game_duration, match_detail, time, season)
        VALUES (?,?,?,?,?, ?,?,?,?,?, ?, ?, ?, ?, ?, ?)
      `).bind(...blueIds, ...redIds, resultVal, game_id ? String(game_id) : null, game_duration || 0, detailJson, game_time, currentSeason).run();
    } else {
      ins = await env.DB.prepare(`
        INSERT INTO results
        (blue1, blue2, blue3, blue4, blue5, red1, red2, red3, red4, red5, result, game_id, game_duration, match_detail, season)
        VALUES (?,?,?,?,?, ?,?,?,?,?, ?, ?, ?, ?, ?)
      `).bind(...blueIds, ...redIds, resultVal, game_id ? String(game_id) : null, game_duration || 0, detailJson, currentSeason).run();
    }

    // 4) players 테이블 승/패/점수 실시간 반영
    const winIds  = (resultVal === 1) ? blueIds : redIds;
    const loseIds = (resultVal === 1) ? redIds  : blueIds;

    await env.DB.prepare(`
      UPDATE players
         SET win = win + 1, rating = rating + 1, last_updated = CURRENT_TIMESTAMP
       WHERE id IN (?,?,?,?,?)
    `).bind(...winIds).run();

    await env.DB.prepare(`
      UPDATE players
         SET loose = loose + 1, rating = rating - 1, last_updated = CURRENT_TIMESTAMP
       WHERE id IN (?,?,?,?,?)
    `).bind(...loseIds).run();

    // 💡 5) 피어리스 밴픽 10개 챔피언 자동 동기화
    if (match_detail && Array.isArray(match_detail.players)) {
      const matchChampIds = match_detail.players
        .map(p => Number(p.champion_id))
        .filter(id => id > 0);
      
      if (matchChampIds.length > 0) {
        await syncFearlessChampions(env, matchChampIds);
      }
    }

    return json({ ok: true, inserted: ins?.lastRowId ?? true });
  } catch (e) {
    return json({ error: 'auto_record_failed', detail: String(e?.message || e) }, 500);
  }
}





// DELETE /api/users?id=123  (관리 PIN 필요)
if (url.pathname === '/api/users' && request.method === 'DELETE') {
  const CORS = {
    'access-control-allow-origin': '*',
    'access-control-allow-headers': 'content-type, x-admin-pin',
    'access-control-allow-methods': 'GET,POST,DELETE,PATCH,OPTIONS',
  };

  const id = Number(url.searchParams.get('id'));
  if (!Number.isFinite(id) || id <= 0) {
    return new Response(JSON.stringify({ error: 'bad_id' }), {
      status: 400, headers: { 'content-type': 'application/json', ...CORS }
    });
  }

  // 🔐 PIN 검증 (헤더로 전달된 값과 하드코딩한 값 비교)
  const supplied = request.headers.get('x-admin-pin') || '';
  if (supplied !== ADMIN_PIN) {
    return new Response(JSON.stringify({ error: 'unauthorized' }), {
      status: 401, headers: { 'content-type': 'application/json', ...CORS }
    });
  }

  const r = await env.DB.prepare('DELETE FROM players WHERE id = ?').bind(id).run();
  const changes = r.changes ?? r.meta?.changes ?? 0;

  if (changes === 0) {
    return new Response(JSON.stringify({ error: 'not_found' }), {
      status: 404, headers: { 'content-type': 'application/json', ...CORS }
    });
  }
  return new Response(JSON.stringify({ ok: true, id }), {
    headers: { 'content-type': 'application/json', ...CORS }
  });
}




// PATCH /api/users/position  { id:number, position_main:""|T|J|M|A|S, position_sub:""|T|J|M|A|S|NONE }
if (url.pathname === '/api/users/position' && request.method === 'PATCH') {
  const CORS = {
    'access-control-allow-origin': '*',
    'access-control-allow-headers': 'content-type',
    'access-control-allow-methods': 'GET,POST,DELETE,PATCH,OPTIONS',
  };
  try{
    const body = await request.json();
    const id = Number(body.id);
    let main = (body.position_main ?? '').toString().trim().toUpperCase();
    let sub  = (body.position_sub  ?? '').toString().trim().toUpperCase();

    // 주 포지션과 부 포지션 허용 값 분리 (부 포지션에 NONE 추가)
    const OK_MAIN = new Set(['','T','J','M','A','S']);
    const OK_SUB  = new Set(['','T','J','M','A','S','NONE']);

    if (!Number.isFinite(id) || id<=0) {
      return new Response(JSON.stringify({error:'bad_id'}), {status:400, headers:{'content-type':'application/json', ...CORS}});
    }
    if (!OK_MAIN.has(main) || !OK_SUB.has(sub)) {
      return new Response(JSON.stringify({error:'bad_position'}), {status:400, headers:{'content-type':'application/json', ...CORS}});
    }
    // 주/부가 같으면 부는 빈값으로 정규화
    if (main && sub && main === sub) sub = '';

    const now = new Date().toISOString().slice(0,19).replace('T',' ');
    const upd = await env.DB.prepare(`
      UPDATE players
         SET position_main = ?, position_sub = ?, last_updated = ?
       WHERE id = ?
    `).bind(main, sub, now, id).run();

    if ((upd.changes ?? upd.meta?.changes ?? 0) === 0) {
      return new Response(JSON.stringify({error:'not_found'}), {status:404, headers:{'content-type':'application/json', ...CORS}});
    }

    const row = await env.DB.prepare(`
      SELECT id, user_id, rating, rating_start, win, loose,
             created_at, last_updated, position_main, position_sub
        FROM players WHERE id = ?
    `).bind(id).first();

    return new Response(JSON.stringify({ok:true, user:row}), {
      headers: {'content-type':'application/json', ...CORS}
    });
  }catch(e){
    return new Response(JSON.stringify({error:'update_failed', detail:String(e?.message||e)}), {
      status:500, headers:{'content-type':'application/json', ...CORS}
    });
  }
}




// ==========================================
// 📝 2. 웹앱 수동 기록 API (POST /api/results)
// ==========================================
if (url.pathname === "/api/results" && request.method === "POST") {
  try {
    const CORS = {
      "access-control-allow-origin": "*",
      "access-control-allow-headers": "content-type",
      "access-control-allow-methods": "GET,POST,DELETE,OPTIONS",
    };

    const b = await request.json();
    const isArr5 = (a) => Array.isArray(a) && a.length === 5 && a.every(x => Number.isInteger(Number(x)) && Number(x) > 0);
    if (!isArr5(b.blue) || !isArr5(b.red) || !['blue','red'].includes(b.winner)) {
      return new Response(JSON.stringify({ error: "Invalid payload" }), { status:400, headers:{ "content-type":"application/json", ...CORS }});
    }

    const blueIds = b.blue.map(Number);
    const redIds  = b.red.map(Number);
    const resultVal = (b.winner === 'blue') ? 1 : 2;
    const currentSeason = b.season || '2026-2';

    await env.DB.prepare(`
      INSERT INTO results
      (blue1,blue2,blue3,blue4,blue5, red1,red2,red3,red4,red5, result, season)
      VALUES (?,?,?,?,?, ?,?,?,?,?, ?, ?)
    `).bind(...blueIds, ...redIds, resultVal, currentSeason).run();

    const winners = (resultVal === 1) ? blueIds : redIds;
    const losers  = (resultVal === 1) ? redIds  : blueIds;

    for (const pid of winners) {
      await env.DB.prepare(`
        UPDATE players
           SET win = COALESCE(win, 0) + 1,
               rating = COALESCE(rating, 0) + 1,
               last_updated = CURRENT_TIMESTAMP
         WHERE id = ?
      `).bind(pid).run();
    }

    for (const pid of losers) {
      await env.DB.prepare(`
        UPDATE players
           SET loose = COALESCE(loose, 0) + 1,
               rating = COALESCE(rating, 0) - 1,
               last_updated = CURRENT_TIMESTAMP
         WHERE id = ?
      `).bind(pid).run();
    }

    const row = await env.DB.prepare(`SELECT * FROM results ORDER BY id DESC LIMIT 1`).first();
    return new Response(JSON.stringify({ ok:true, result: row }), { headers:{ "content-type":"application/json", ...CORS }});

  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), {
      status: 500,
      headers: { "content-type": "application/json", "access-control-allow-origin": "*" }
    });
  }
}



// ==========================================
// 📊 GET /api/results (상세 통계 match_detail 포함 조회)
// ==========================================
if (url.pathname === "/api/results" && request.method === "GET") {
  const CORS = {
    "access-control-allow-origin": "*",
    "access-control-allow-headers": "content-type",
    "access-control-allow-methods": "GET,POST,DELETE,OPTIONS",
  };

  const limit = Math.min(200, Number(url.searchParams.get("limit") || 50));

  const { results } = await env.DB.prepare(`
    SELECT r.id, r.result, r.time, r.fearless,
           COALESCE(r.game_id, '') AS game_id,
           COALESCE(r.game_duration, 0) AS game_duration,
           COALESCE(r.match_detail, '{}') AS match_detail,
           pb1.user_id AS blue1_name, pb2.user_id AS blue2_name, pb3.user_id AS blue3_name, pb4.user_id AS blue4_name, pb5.user_id AS blue5_name,
           pr1.user_id AS red1_name,  pr2.user_id AS red2_name,  pr3.user_id AS red3_name,  pr4.user_id AS red4_name,  pr5.user_id AS red5_name
    FROM results r
      LEFT JOIN players pb1 ON r.blue1 = pb1.id
      LEFT JOIN players pb2 ON r.blue2 = pb2.id
      LEFT JOIN players pb3 ON r.blue3 = pb3.id
      LEFT JOIN players pb4 ON r.blue4 = pb4.id
      LEFT JOIN players pb5 ON r.blue5 = pb5.id
      LEFT JOIN players pr1 ON r.red1  = pr1.id
      LEFT JOIN players pr2 ON r.red2  = pr2.id
      LEFT JOIN players pr3 ON r.red3  = pr3.id
      LEFT JOIN players pr4 ON r.red4  = pr4.id
      LEFT JOIN players pr5 ON r.red5  = pr5.id
    ORDER BY r.id DESC
    LIMIT ?
  `).bind(limit).all();

  return new Response(JSON.stringify(results), {
    headers: { "content-type": "application/json", ...CORS }
  });
}
// 3. 경기 결과 삭제 및 점수 롤백 (DELETE)
if (url.pathname === "/api/results" && request.method === "DELETE") {
  const CORS = {
    "access-control-allow-origin": "*",
    "access-control-allow-headers": "content-type, x-admin-pin",
    "access-control-allow-methods": "GET,POST,DELETE,OPTIONS",
  };

  try {
    const id = Number(url.searchParams.get('id'));
    if (!Number.isFinite(id) || id <= 0) {
      return json({ error: 'bad_id' }, 400);
    }

    // 🔐 관리자 PIN 검증
    const supplied = request.headers.get('x-admin-pin') || '';
    if (supplied !== ADMIN_PIN) {
      return json({ error: 'unauthorized' }, 401);
    }

    // 1) 대상 결과 행 조회 (롤백을 위해 누구였는지 알아야 함)
    const rec = await env.DB.prepare(`SELECT * FROM results WHERE id = ?`).bind(id).first();
    if (!rec) {
      return json({ error: 'not_found' }, 404);
    }

    // 2) 롤백 대상자 및 승패 확인
    const blueIds = [rec.blue1, rec.blue2, rec.blue3, rec.blue4, rec.blue5].map(Number);
    const redIds  = [rec.red1, rec.red2, rec.red3, rec.red4, rec.red5].map(Number);
    const winner  = Number(rec.result) === 1 ? 'blue' : 'red';
    const now = new Date().toISOString().slice(0,19).replace('T',' ');

    // 승자/패자 그룹 분류
    const winIds = (winner === 'blue') ? blueIds : redIds;
    const loseIds= (winner === 'blue') ? redIds  : blueIds;

    // 3) 점수/승패 롤백 실행 (순차 실행)
    
    // 승자 롤백: 승리수 -1, 점수 -1
    for (const pid of winIds) {
      await env.DB.prepare(`
        UPDATE players
           SET win = MAX(0, win - 1),
               rating = rating - 1,
               last_updated = ?
         WHERE id = ?
      `).bind(now, pid).run();
    }

    // 패자 롤백: 패배수 -1, 점수 +1 (점수 복구)
    for (const pid of loseIds) {
      await env.DB.prepare(`
        UPDATE players
           SET loose = MAX(0, loose - 1),
               rating = rating + 1,
               last_updated = ?
         WHERE id = ?
      `).bind(now, pid).run();
    }

    // 4) 결과 행 삭제
    await env.DB.prepare(`DELETE FROM results WHERE id = ?`).bind(id).run();

    return json({ ok: true, id, undone: true });

  } catch (e) {
    return json({ error: 'delete_failed', detail: String(e.message) }, 500);
  }
}




// [추가] 피어리스 여부 토글 API
// POST /api/results/fearless  body: { id: 123, fearless: 1 or 0 }
if (url.pathname === "/api/results/fearless" && request.method === "POST") {
  try {
    const body = await request.json();
    const id = Number(body.id);
    const fearless = body.fearless ? 1 : 0; // 1(True) or 0(False)

    // DB 업데이트
    await env.DB.prepare("UPDATE results SET fearless = ? WHERE id = ?")
      .bind(fearless, id)
      .run();

    return new Response(JSON.stringify({ ok: true, id, fearless }), {
      headers: { "content-type": "application/json", ...CORS }
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: e.message }), {
      status: 500, headers: { "content-type": "application/json", ...CORS }
    });
  }
}



// GET /api/auction/current
if (url.pathname === '/api/auction/current' && request.method === 'GET') {
  const row = await env.DB.prepare(
    "SELECT * FROM auction_state WHERE id = 'current'"
  ).first();
  return json(row || null);
}

// POST /api/auction/prepare
if (url.pathname === '/api/auction/prepare' && request.method === 'POST') {
  try {
    const { captains, pool } = await request.json();
    const poolJson = JSON.stringify(pool || []);
    await env.DB.prepare(`
      INSERT INTO auction_state (id,status,blue_id,blue_name,red_id,red_name,pool_json,claim_blue,claim_red)
      VALUES ('current','waiting',? ,?, ?,?, ?, 0,0)
      ON CONFLICT(id) DO UPDATE SET
        status='waiting',
        blue_id=? , blue_name=? ,
        red_id=?  , red_name=?  ,
        pool_json=?,
        claim_blue=0, claim_red=0,
        updated_at=CURRENT_TIMESTAMP
    `)
    .bind(
      captains.blue.id, captains.blue.name,
      captains.red.id,  captains.red.name,
      poolJson,
      // update
      captains.blue.id, captains.blue.name,
      captains.red.id,  captains.red.name,
      poolJson
    ).run();

    return json({ ok: true });
  } catch (e) {
    // 오류도 CORS 포함해서 반환해야 브라우저가 상태코드를 볼 수 있음
    return json({ error: e.message || 'prepare failed' }, 500);
  }
}

// POST /api/auction/claim   body: { side: 'blue' | 'red' }
if (url.pathname === '/api/auction/claim' && request.method === 'POST') {
  try {
    const { side } = await request.json();
    if (side !== 'blue' && side !== 'red') return json({ error:'bad side' }, 400);

    const col = side === 'blue' ? 'claim_blue' : 'claim_red';
    await env.DB.prepare(`UPDATE auction_state SET ${col}=1, updated_at=CURRENT_TIMESTAMP WHERE id='current'`).run();

    // 🔹 아주 짧은 대기 (D1 write 반영 대기)
    await new Promise(r => setTimeout(r, 150));

    // 🔹 fresh하게 다시 SELECT (강제 쿼리)
    const after = await env.DB.prepare("SELECT claim_blue, claim_red FROM auction_state WHERE id='current'").first();

    // 둘 다 확정 → ready 상태로
    if ((after?.claim_blue|0) === 1 && (after?.claim_red|0) === 1) {
      await env.DB.prepare(`
        UPDATE auction_state
           SET status='ready',
               seed_at=CURRENT_TIMESTAMP,
               current_idx=-1,
               round=1,
               bid=0,
               bid_side=NULL,
               bid_updated_at=NULL,
               slot_deadline=NULL,
               event_json=NULL,
               event_until=NULL,
               assigned_json='{"blue":[],"red":[],"failed":[]}',
               blue_pts=1000,
               red_pts=1000,
               updated_at=CURRENT_TIMESTAMP
         WHERE id='current'
      `).run();
    }

    const out = await env.DB.prepare("SELECT * FROM auction_state WHERE id='current'").first();
    return json(out || { ok:true });
  } catch (e) {
    return json({ error: e.message || 'claim failed' }, 500);
  }
}






// POST /api/auction/bid 수정
if (url.pathname === '/api/auction/bid' && request.method === 'POST') {
  try {
    const body = await request.json();
    const side  = (body.side || '').toLowerCase();
    const add   = Number(body.inc || 0);
    const allin = !!body.allin;

    if (!(side === 'blue' || side === 'red')) return json({ error:'bad_request' }, 400);

    const row = await env.DB.prepare("SELECT * FROM auction_state WHERE id='current'").first();
    if (!row || row.status !== 'ready') return json({ error:'not_ready' }, 409);
    if ((row.current_idx|0) === -1)     return json({ error:'not_started' }, 409);

    const myPts = side === 'blue' ? (row.blue_pts|0) : (row.red_pts|0);
    if (myPts <= 0) return json({ error:'insufficient_funds' }, 409);

    let newBid;
    if (allin) {
      newBid = myPts;
    } else {
      if (!Number.isFinite(add) || add <= 0) return json({ error:'bad_request' }, 400);
      newBid = (row.bid|0) + add;
      if (newBid > myPts) return json({ error:'insufficient_funds' }, 409);
    }

    // 🔥 [핵심 변경] SQL 함수 대신 JS로 절대 시간 계산
    // 15초 연장
    const newDeadline = getNowStr(15000); 
    const nowStr = getNowStr(0);

    await env.DB.prepare(`
      UPDATE auction_state
         SET bid = ?, 
             bid_side = ?, 
             bid_updated_at = ?,
             slot_deadline = ?,   -- 절대 시간 입력
             updated_at = ?
       WHERE id = 'current'
    `).bind(newBid, side, nowStr, newDeadline, nowStr).run();

    // 갱신된 상태 즉시 반환
    const out = await env.DB.prepare("SELECT * FROM auction_state WHERE id='current'").first();
    return json(out || { ok:true });
  } catch (e) {
    return json({ error: e.message || 'bid failed' }, 500);
  }
}


// POST /api/auction/step 수정
if (url.pathname === '/api/auction/step' && request.method === 'POST') {
  try {
    // 1. 일단 읽기만 함 (Read: 빠름)
    const row = await env.DB.prepare("SELECT * FROM auction_state WHERE id='current'").first();
    if (!row || row.status !== 'ready') return json({ ok:true, state: row || null });

    const now = Date.now();
    
    // 데이터 파싱
    const pool = JSON.parse(row.pool_json || '[]');
    const seedAt = row.seed_at ? Date.parse(row.seed_at + 'Z') : null;

    // 셔플 유틸 (그대로 유지)
    function mulberry32(a){ return function(){ let t=a+=0x6D2B79F5; t=Math.imul(t^t>>>15,t|1); t^=t+Math.imul(t^t>>>7,t|61); return ((t^t>>>14)>>>0)/4294967296; } }
    function seededShuffle(arr, seed){ const rng=mulberry32(seed>>>0), a=arr.slice(); for(let i=a.length-1;i>0;i--){ const j=Math.floor(rng()*(i+1)); [a[i],a[j]]=[a[j],a[i]]; } return a; }
    function safeParse(s, def){ try{ return JSON.parse(s||'') }catch{ return def } }

    const order = seedAt ? seededShuffle(pool, seedAt|0) : pool.slice();

    // ───────────────────────────────────────────────────────────────
    // A. 게임 시작 전 (프리카운트 10초) 로직
    // ───────────────────────────────────────────────────────────────
    if ((row.current_idx|0) === -1) {
      // seedAt + 10초가 지났는지 JS로 확인
      if (seedAt && (now >= seedAt + 10000)) {
        // 🔥 [Write] 10초 지남 -> 첫 슬롯 시작! (마감은 +15초 뒤로 설정)
        const firstDeadline = getNowStr(15000); // 15초 뒤
        const nowStr = getNowStr(0);

        await env.DB.prepare(`
          UPDATE auction_state
             SET current_idx=0,
                 round=1,
                 bid=0,
                 bid_side=NULL,
                 bid_updated_at=NULL,
                 slot_deadline=?,       -- 절대 시간
                 event_json=NULL,
                 event_until=NULL,
                 updated_at=?
           WHERE id='current'
        `).bind(firstDeadline, nowStr).run();
        
        // 변경된 상태 다시 조회해서 리턴
        const out = await env.DB.prepare("SELECT * FROM auction_state WHERE id='current'").first();
        return json({ ok:true, state: out });
      }
      // 시간이 안 됐으면 그냥 현재 상태 리턴 (DB 쓰기 X -> 렉 없음)
      return json({ ok:true, state: row });
    }

    // ───────────────────────────────────────────────────────────────
    // B. 게임 진행 중 (슬롯 마감 체크) 로직
    // ───────────────────────────────────────────────────────────────
    const assigned = safeParse(row.assigned_json, {blue:[], red:[], failed:[]});
    const r2List   = assigned.failed || [];
    const roundList= (row.round|0) === 1 ? order : r2List;
    const total    = roundList.length;

    if (!total || !row.slot_deadline) return json({ ok:true, state: row });

    // JS로 마감 시간 파싱
    const deadlineMs = Date.parse(row.slot_deadline + 'Z');
    const GRACE_MS = 2000; // 유예 시간 2초 (기존 유지)

    // 🔥 [핵심] 아직 마감시간 + 2초가 안 지났으면 아무것도 안 함!
    if (now < deadlineMs + GRACE_MS) {
      return json({ ok:true, state: row });
    }

    // ───────────────────────────────────────────────────────────────
    // C. 정산 로직 (여기는 시간이 지났을 때만 실행됨)
    // ───────────────────────────────────────────────────────────────
    const idx = row.current_idx|0;
    const pid = roundList[idx];
    let bluePts = row.blue_pts|0;
    let redPts  = row.red_pts|0;
    let event   = null;

    if ((row.bid|0) > 0 && (row.bid_side === 'blue' || row.bid_side === 'red')) {
      // 낙찰
      if (row.bid_side === 'blue') bluePts = Math.max(0, bluePts - (row.bid|0));
      if (row.bid_side === 'red')  redPts  = Math.max(0, redPts  - (row.bid|0));
      assigned[row.bid_side] = (assigned[row.bid_side] || []).concat([pid]);
      assigned.failed = (assigned.failed || []).filter(id => id !== pid);
      event = { type:'win', player: pid, side: row.bid_side, bid: (row.bid|0) };
    } else {
      // 유찰
      if ((row.round|0) === 1) assigned.failed = (assigned.failed || []).concat([pid]);
      event = { type:'fail', player: pid };
    }

    // 다음 슬롯/라운드 계산
    let nextRound = (row.round|0);
    let nextIdx   = idx + 1;
    const thisRoundTotal = roundList.length;
    let isFinished = false;

    if (nextIdx >= thisRoundTotal) {
      if (nextRound === 1) {
        nextRound = 2;
        nextIdx   = 0;
      } else {
        isFinished = true;
      }
    }

    const nowStr = getNowStr(0);
    
    // 이벤트 보여줄 시간 (3초)
    const eventUntil = getNowStr(3000); 

    if (isFinished) {
      // 경매 종료
      await env.DB.prepare(`
        UPDATE auction_state
           SET assigned_json=?,
               blue_pts=?,
               red_pts=?,
               bid=0, bid_side=NULL, bid_updated_at=NULL,
               slot_deadline=NULL,
               event_json=?,
               event_until=?,
               updated_at=?
         WHERE id='current'
      `).bind(JSON.stringify(assigned), bluePts, redPts, JSON.stringify(event), eventUntil, nowStr).run();
    } else {
      // 다음 슬롯 시작 (기본 20초 부여)
      const nextDeadline = getNowStr(20000); 
      await env.DB.prepare(`
        UPDATE auction_state
           SET assigned_json=?,
               round=?,
               current_idx=?,
               blue_pts=?,
               red_pts=?,
               bid=0,
               bid_side=NULL,
               bid_updated_at=NULL,
               slot_deadline=?,      -- 다음 타자 마감 시간
               event_json=?,
               event_until=?,
               updated_at=?
         WHERE id='current'
      `).bind(JSON.stringify(assigned), nextRound, nextIdx, bluePts, redPts, nextDeadline, JSON.stringify(event), eventUntil, nowStr).run();
    }

    // 결과 리턴
    const out = await env.DB.prepare("SELECT * FROM auction_state WHERE id='current'").first();
    return json({ ok:true, state: out });

  } catch (e) {
    return json({ error: e.message || 'step failed' }, 500);
  }
}

// ==========================
// FEARLESS 밴픽 API (수정됨: 순서 로직 추가)
// ==========================

if (url.pathname === "api/fearless" && request.method === "GET") {
  return Response.redirect("/api/fearless", 301);
}
if (url.pathname === "api/fearless" && request.method === "POST") {
  return Response.redirect("/api/fearless", 301);
}

// GET /api/fearless  → 챔피언 전체 상태 조회
if (url.pathname === "/api/fearless" && request.method === "GET") {
  // pick_order 컬럼도 같이 조회
  const { results } = await env.DB.prepare(`
    SELECT champ_id, status, pick_order, updated_at, ip
    FROM champion_status
    ORDER BY champ_id
  `).all();
  return new Response(JSON.stringify(results), {
    headers: { "content-type": "application/json", ...CORS }
  });
}

// POST /api/fearless  → 특정 챔피언 상태 토글 (+ 순서 빈자리 채우기)
// body: { champ_id: number, status?: 'available'|'picked' }
if (url.pathname === "/api/fearless" && request.method === "POST") {
  try {
    const body = await request.json();
    const champ_id = Number(body.champ_id);
    if (!Number.isFinite(champ_id)) {
      return new Response(JSON.stringify({ error: "invalid_champ_id" }), { status: 400, headers: CORS });
    }

    const ip = request.headers.get("cf-connecting-ip") || "unknown";
    const now = new Date().toISOString().slice(0, 19).replace("T", " ");

    // 1. 현재 상태 확인 (순서 포함)
    const existing = await env.DB.prepare(
      "SELECT id, status, pick_order FROM champion_status WHERE champ_id = ?"
    ).bind(champ_id).first();

    // 2. 목표 상태 결정
    let newStatus = body.status;
    if (!newStatus) {
      // 명시적 상태 없으면 토글
      newStatus = existing && existing.status === "picked" ? "available" : "picked";
    }

    // 3. 순서(pick_order) 결정 로직 (핵심!)
    let targetOrder = 0; // 기본값 (available일 때)

    if (newStatus === 'picked') {
      // 이미 픽 되어있는 상태면 기존 순서 유지 (새 번호 따지 않음)
      if (existing && existing.status === 'picked' && (existing.pick_order||0) > 0) {
        targetOrder = existing.pick_order;
      } else {
        // 🚀 빈 번호 찾기 (Gap Filling)
        // 현재 픽된 번호들을 오름차순으로 가져옵니다. (0 제외)
        const { results } = await env.DB.prepare(`
          SELECT pick_order 
          FROM champion_status 
          WHERE status='picked' AND pick_order > 0 
          ORDER BY pick_order ASC
        `).all();

        let candidate = 1;
        // 1부터 시작해서 있는 번호인지 확인. 건너뛴 번호가 나오면 그게 내 자리.
        for (const row of results) {
          if (row.pick_order === candidate) {
            candidate++;
          } else if (row.pick_order > candidate) {
            // 예: 내 차례는 3인데 DB엔 4가 있다 -> 3이 비었다!
            break; 
          }
        }
        targetOrder = candidate;
      }
    } else {
      // available 로 돌아갈 때는 순서를 0으로 초기화 (자리 비워줌)
      targetOrder = 0;
    }

    // 4. DB 반영 (INSERT OR UPDATE)
    if (existing) {
      await env.DB.prepare(
        "UPDATE champion_status SET status=?, pick_order=?, updated_at=?, ip=? WHERE champ_id=?"
      ).bind(newStatus, targetOrder, now, ip, champ_id).run();
    } else {
      await env.DB.prepare(
        "INSERT INTO champion_status (champ_id, status, pick_order, updated_at, ip) VALUES (?, ?, ?, ?, ?)"
      ).bind(champ_id, newStatus, targetOrder, now, ip).run();
    }

    return new Response(JSON.stringify({ ok: true, champ_id, newStatus, pick_order: targetOrder }), {
      headers: { "content-type": "application/json", ...CORS }
    });

  } catch (e) {
    return new Response(JSON.stringify({ error: e.message || "update_failed" }), {
      status: 500, headers: { "content-type": "application/json", ...CORS }
    });
  }
}

// POST /api/fearless/reset  → 전체 초기화 (순서도 0으로)
if (url.pathname === "/api/fearless/reset" && request.method === "POST") {
  await env.DB.prepare(`
    UPDATE champion_status
    SET status='available', pick_order=0, updated_at=CURRENT_TIMESTAMP
  `).run();

  return new Response(JSON.stringify({ ok: true, reset: true }), {
    headers: { "content-type": "application/json", ...CORS }
  });
}







async function handleAuctionStep(req, env) {
  const row = await env.DB.prepare("SELECT * FROM auction_state WHERE id = 'current'").first();
  if (!row || row.status !== 'ready') return json({ ok:true, state: row || null });

  const pool = JSON.parse(row.pool_json || '[]');
  const N    = Array.isArray(pool) ? pool.length : 0;
  const seedAt = row.seed_at ? Date.parse(row.seed_at + 'Z') : null;
  const now    = Date.now();

  // 셔플
  function mulberry32(a){ return function(){ let t=a+=0x6D2B79F5; t=Math.imul(t^t>>>15,t|1); t^=t+Math.imul(t^t>>>7,t|61); return ((t^t>>>14)>>>0)/4294967296; } }
  function seededShuffle(arr, seed){ const rng=mulberry32(seed>>>0), a=arr.slice(); for(let i=a.length-1;i>0;i--){ const j=Math.floor(rng()*(i+1)); [a[i],a[j]]=[a[j],a[i]]; } return a; }
  const order = seedAt ? seededShuffle(pool, seedAt|0) : pool.slice();

  // 시작 전 → 3초 지나면 첫 슬롯 시작
  if ((row.current_idx|0) === -1) {
    if (seedAt && ( (now - seedAt)/1000 >= 3 )) {
      await env.DB.prepare(`
        UPDATE auction_state
           SET current_idx = 0,
               round = 1,
               bid = 0,
               bid_side = NULL,
               bid_updated_at = CURRENT_TIMESTAMP,
               updated_at = CURRENT_TIMESTAMP
         WHERE id = 'current'
      `).run();
      const out = await env.DB.prepare("SELECT * FROM auction_state WHERE id = 'current'").first();
      return json({ ok:true, state: out });
    }
    return json({ ok:true, state: row });
  }

  const assigned = safeParse(row.assigned_json, {blue:[], red:[], failed:[]});
  const r2List   = assigned.failed || [];
  const roundList= (row.round|0) === 1 ? order : r2List;
  const total    = roundList.length;

  if (!total || row.bid_updated_at == null) {
    return json({ ok:true, state: row });
  }

  const lastBidMs = Date.parse(row.bid_updated_at + 'Z');
  const elapsed   = (now - lastBidMs)/1000;

  // 5초 경과 → 확정
  if (elapsed >= 2) {
    const idx = row.current_idx|0;
    const pid = roundList[idx];

    if ((row.bid|0) > 0 && (row.bid_side === 'blue' || row.bid_side === 'red')) {
      assigned[row.bid_side] = (assigned[row.bid_side] || []).concat([pid]);
      assigned.failed = (assigned.failed || []).filter(id => id !== pid);
    } else {
      if ((row.round|0) === 1) {
        assigned.failed = (assigned.failed || []).concat([pid]);
      }
    }

    let nextRound = (row.round|0);
    let nextIdx   = idx + 1;
    if (nextIdx >= total) {
      if (nextRound === 1) {
        nextRound = 2;
        nextIdx   = 0;
      } else {
        await env.DB.prepare(`
          UPDATE auction_state
             SET assigned_json = ?,
                 bid = 0, bid_side = NULL, bid_updated_at = NULL,
                 updated_at = CURRENT_TIMESTAMP
           WHERE id = 'current'
        `).bind(JSON.stringify(assigned)).run();
        const out = await env.DB.prepare("SELECT * FROM auction_state WHERE id = 'current'").first();
        return json({ ok:true, state: out });
      }
    }

    await env.DB.prepare(`
      UPDATE auction_state
         SET assigned_json = ?,
             round = ?,
             current_idx = ?,
             bid = 0,
             bid_side = NULL,
             bid_updated_at = CURRENT_TIMESTAMP,
             updated_at = CURRENT_TIMESTAMP
       WHERE id = 'current'
    `).bind(JSON.stringify(assigned), nextRound, nextIdx).run();

    const out = await env.DB.prepare("SELECT * FROM auction_state WHERE id = 'current'").first();
    return json({ ok:true, state: out });
  }

  return json({ ok:true, state: row });

  function safeParse(s, def){ try{ return JSON.parse(s||'') }catch{ return def } }
}

function utcNow(){ return new Date(Date.now() - (new Date()).getTimezoneOffset()*60000).toISOString().slice(0,19).replace('T',' '); }
function json(obj, code=200){ return new Response(JSON.stringify(obj), { status: code, headers: {
  "Content-Type":"application/json",
  "Access-Control-Allow-Origin":"*",
  "Access-Control-Allow-Methods":"GET,POST,DELETE,OPTIONS",
  "Access-Control-Allow-Headers":"Content-Type"
}}); }



// -------------------------
// Vote log APIs (insert/update/delete/list + players stat refresh)
// POST /api/vote_log   { toWhom, vote_1..vote_6 (1.0~10.0 floats) }
// GET  /api/vote_log?toWhom=...   -> list votes (optionally filter by ip)
// DELETE /api/vote_log   { toWhom, ip? }  -> remove a vote by ip+toWhom (or by ip if toWhom omitted)
// CORS/OPTIONS supported
// -------------------------

if (url.pathname === "/api/vote_log" && (request.method === "OPTIONS")) {
  return new Response(null, { status: 204, headers: {
    "access-control-allow-origin":"*",
    "access-control-allow-methods":"GET,POST,DELETE,OPTIONS",
    "access-control-allow-headers":"Content-Type"
  }});
}

if (url.pathname === "/api/vote_log" && request.method === "POST") {
  const CORS = {
    "access-control-allow-origin":"*",
    "access-control-allow-methods":"GET,POST,DELETE,OPTIONS",
    "access-control-allow-headers":"Content-Type",
    "content-type":"application/json"
  };

  try {
    const body = await request.json();
    const toWhom = Number(body.toWhom);
    if (!toWhom || Number.isNaN(toWhom)) {
      return new Response(JSON.stringify({ error: "invalid_toWhom" }), { status: 400, headers: CORS });
    }

    // 점수 1.0~10.0 입력을 0~100 정수로 변환
    const votes = [];
    for (let i=1;i<=6;i++){
      let v = body[`vote_${i}`];
      if (v === undefined) {
        return new Response(JSON.stringify({ error: `missing vote_${i}` }), { status: 400, headers: CORS });
      }
      v = Number(v);
      if (Number.isNaN(v) || v < 0) {
        return new Response(JSON.stringify({ error: `invalid vote_${i}` }), { status: 400, headers: CORS });
      }
      // clamp 0..10 then scale
      if (v > 10) v = 10;
      const vi = Math.round(v * 10); // 0..100 integer
      votes.push(vi);
    }

    // Get client IP (Cloudflare provides cf-connecting-ip). Fallbacks included.
    const ip = request.headers.get("cf-connecting-ip")
             || request.headers.get("x-forwarded-for")?.split(",")[0]?.trim()
             || request.headers.get("x-real-ip")
             || "0.0.0.0";

    // verify toWhom exists in players
    const playerRow = await env.DB.prepare(`SELECT id FROM players WHERE id = ?`).bind(toWhom).first();
    if (!playerRow) {
      return new Response(JSON.stringify({ error: "toWhom_not_found" }), { status: 404, headers: CORS });
    }

    // check existing vote by this ip -> if exists update, else insert
    const existing = await env.DB.prepare(
      `SELECT id FROM vote_log WHERE ip = ? AND toWhom = ?`
    ).bind(ip, toWhom).first();

    let action = 'insert';
    if (existing && existing.id) {
      // update
      await env.DB.prepare(`
        UPDATE vote_log
        SET vote_1 = ?, vote_2 = ?, vote_3 = ?, vote_4 = ?, vote_5 = ?, vote_6 = ?, time = CURRENT_TIMESTAMP
        WHERE id = ?
      `).bind(votes[0], votes[1], votes[2], votes[3], votes[4], votes[5], existing.id).run();
      action = 'update';
    } else {
      // insert
      await env.DB.prepare(`
        INSERT INTO vote_log (ip, toWhom, vote_1, vote_2, vote_3, vote_4, vote_5, vote_6)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `).bind(ip, toWhom, votes[0], votes[1], votes[2], votes[3], votes[4], votes[5]).run();
      action = 'insert';
    }

    // Recompute aggregated stats for toWhom from vote_log
    const agg = await env.DB.prepare(`
      SELECT 
        COUNT(*) AS cnt,
        COALESCE(SUM(vote_1),0) AS s1,
        COALESCE(SUM(vote_2),0) AS s2,
        COALESCE(SUM(vote_3),0) AS s3,
        COALESCE(SUM(vote_4),0) AS s4,
        COALESCE(SUM(vote_5),0) AS s5,
        COALESCE(SUM(vote_6),0) AS s6
      FROM vote_log
      WHERE toWhom = ?
    `).bind(toWhom).first();

    const cnt = agg ? Number(agg.cnt) : 0;
    let newStats = { stat_vote: 0, stat_1:0, stat_2:0, stat_3:0, stat_4:0, stat_5:0, stat_6:0 };

    if (cnt > 0) {
      // compute per-stat average (stored as 0..100 ints)
      const avg1 = Math.round(Number(agg.s1) / cnt);
      const avg2 = Math.round(Number(agg.s2) / cnt);
      const avg3 = Math.round(Number(agg.s3) / cnt);
      const avg4 = Math.round(Number(agg.s4) / cnt);
      const avg5 = Math.round(Number(agg.s5) / cnt);
      const avg6 = Math.round(Number(agg.s6) / cnt);

      // write back to players table
      await env.DB.prepare(`
        UPDATE players
        SET stat_vote = ?, stat_1 = ?, stat_2 = ?, stat_3 = ?, stat_4 = ?, stat_5 = ?, stat_6 = ?
        WHERE id = ?
      `).bind(cnt, avg1, avg2, avg3, avg4, avg5, avg6, toWhom).run();

      newStats = { stat_vote: cnt, stat_1: avg1, stat_2: avg2, stat_3: avg3, stat_4: avg4, stat_5: avg5, stat_6: avg6 };
    } else {
      // no votes: set vote=0 and stats to 0
      await env.DB.prepare(`
        UPDATE players
        SET stat_vote = 0, stat_1 = 0, stat_2 = 0, stat_3 = 0, stat_4 = 0, stat_5 = 0, stat_6 = 0
        WHERE id = ?
      `).bind(toWhom).run();

      newStats = { stat_vote: 0, stat_1:0, stat_2:0, stat_3:0, stat_4:0, stat_5:0, stat_6:0 };
    }

    return new Response(JSON.stringify({ ok:true, action, ip, toWhom, newStats }), { status: 200, headers: CORS });

  } catch (err) {
    console.error("vote_log POST error:", err);
    return new Response(JSON.stringify({ error: "internal_error", detail: String(err) }), { status: 500, headers: {
      "access-control-allow-origin":"*",
      "access-control-allow-methods":"GET,POST,DELETE,OPTIONS",
      "access-control-allow-headers":"Content-Type",
      "content-type":"application/json"
    }});
  }
}


// GET votes (list). optional ?toWhom=ID & ?ip=IP filter
if (url.pathname === "/api/vote_log" && request.method === "GET") {
  const CORS = {
    "access-control-allow-origin":"*",
    "access-control-allow-methods":"GET,POST,DELETE,OPTIONS",
    "access-control-allow-headers":"Content-Type",
    "content-type":"application/json"
  };

  const q = Object.fromEntries(url.searchParams.entries());
  try {
    let sql = `SELECT id, ip, time, toWhom, vote_1, vote_2, vote_3, vote_4, vote_5, vote_6 FROM vote_log`;
    const binds = [];
    const where = [];
    if (q.toWhom) { where.push("toWhom = ?"); binds.push(Number(q.toWhom)); }
    if (q.ip) { where.push("ip = ?"); binds.push(q.ip); }
    if (where.length) sql += " WHERE " + where.join(" AND ");
    sql += " ORDER BY time DESC LIMIT 1000"; // safety limit

    const { results } = await env.DB.prepare(sql).bind(...binds).all();
    return new Response(JSON.stringify(results), { status: 200, headers: CORS });
  } catch (err) {
    console.error("vote_log GET error:", err);
    return new Response(JSON.stringify({ error: "internal_error", detail: String(err) }), { status: 500, headers: CORS });
  }
}


// DELETE vote (by ip+toWhom). Client can send JSON body { toWhom, ip } or use query params
if (url.pathname === "/api/vote_log" && request.method === "DELETE") {
  const CORS = {
    "access-control-allow-origin":"*",
    "access-control-allow-methods":"GET,POST,DELETE,OPTIONS",
    "access-control-allow-headers":"Content-Type",
    "content-type":"application/json"
  };

  try {
    let body = {};
    try { body = await request.json(); } catch(e){ body = {}; }
    const q = Object.fromEntries(url.searchParams.entries());
    const toWhom = Number(body.toWhom ?? q.toWhom);
    const ipParam = body.ip ?? q.ip;

    if (!toWhom || Number.isNaN(toWhom)) {
      return new Response(JSON.stringify({ error: "invalid_toWhom" }), { status: 400, headers: CORS });
    }

    // If ip not provided, try cf-connecting-ip
    const ip = ipParam || request.headers.get("cf-connecting-ip") || request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || null;
    if (!ip) {
      return new Response(JSON.stringify({ error: "ip_required" }), { status: 400, headers: CORS });
    }

    // delete matching row
    await env.DB.prepare(`DELETE FROM vote_log WHERE ip = ? AND toWhom = ?`).bind(ip, toWhom).run();

    // recompute aggregates for toWhom (same as POST)
    const agg = await env.DB.prepare(`
      SELECT 
        COUNT(*) AS cnt,
        COALESCE(SUM(vote_1),0) AS s1,
        COALESCE(SUM(vote_2),0) AS s2,
        COALESCE(SUM(vote_3),0) AS s3,
        COALESCE(SUM(vote_4),0) AS s4,
        COALESCE(SUM(vote_5),0) AS s5,
        COALESCE(SUM(vote_6),0) AS s6
      FROM vote_log
      WHERE toWhom = ?
    `).bind(toWhom).first();

    const cnt = agg ? Number(agg.cnt) : 0;
    if (cnt > 0) {
      const avg1 = Math.round(Number(agg.s1) / cnt);
      const avg2 = Math.round(Number(agg.s2) / cnt);
      const avg3 = Math.round(Number(agg.s3) / cnt);
      const avg4 = Math.round(Number(agg.s4) / cnt);
      const avg5 = Math.round(Number(agg.s5) / cnt);
      const avg6 = Math.round(Number(agg.s6) / cnt);
      await env.DB.prepare(`
        UPDATE players
        SET stat_vote = ?, stat_1 = ?, stat_2 = ?, stat_3 = ?, stat_4 = ?, stat_5 = ?, stat_6 = ?
        WHERE id = ?
      `).bind(cnt, avg1, avg2, avg3, avg4, avg5, avg6, toWhom).run();
      return new Response(JSON.stringify({ ok:true, deleted:{ip,toWhom}, stat_vote:cnt, stat_1:avg1, stat_2:avg2, stat_3:avg3, stat_4:avg4, stat_5:avg5, stat_6:avg6 }), { status:200, headers:CORS });
    } else {
      await env.DB.prepare(`
        UPDATE players
        SET stat_vote = 0, stat_1 = 0, stat_2 = 0, stat_3 = 0, stat_4 = 0, stat_5 = 0, stat_6 = 0
        WHERE id = ?
      `).bind(toWhom).run();
      return new Response(JSON.stringify({ ok:true, deleted:{ip,toWhom}, stat_vote:0 }), { status:200, headers:CORS });
    }

  } catch (err) {
    console.error("vote_log DELETE error:", err);
    return new Response(JSON.stringify({ error:"internal_error", detail:String(err) }), { status:500, headers:{
      "access-control-allow-origin":"*",
      "access-control-allow-methods":"GET,POST,DELETE,OPTIONS",
      "access-control-allow-headers":"Content-Type",
      "content-type":"application/json"
    }});
  }
}

// ✅ 활성화 상태 업데이트
if (url.pathname === "/api/users/active" && request.method === "POST") {
  const body = await request.json();
  const { id, active } = body;
  await env.DB.prepare("UPDATE players SET active = ? WHERE id = ?").bind(active, id).run();
  return new Response(JSON.stringify({ success: true }), {
    headers: { "content-type": "application/json", ...CORS }
  });
}

// ============================================================
    // 🎬 명예의 전당 (비디오) API
    // ============================================================
    if (url.pathname === "/api/videos" && request.method === "GET") {
      const CORS = {
        "access-control-allow-origin": "*",
        "access-control-allow-headers": "content-type",
        "access-control-allow-methods": "GET,POST,DELETE,OPTIONS",
      };

      try {
        // DB에서 영상 목록 조회 (최신순 정렬)
        // uploader_id를 이용해 players 테이블에서 닉네임(user_id)도 같이 가져옴
        const { results } = await env.DB.prepare(`
          SELECT v.id, v.title, v.description, v.filename, v.created_at, 
                 p.user_id AS uploader_name
          FROM videos v
          LEFT JOIN players p ON v.uploader_id = p.id
          ORDER BY v.created_at DESC
        `).all();

        return new Response(JSON.stringify(results), {
          headers: { "content-type": "application/json", ...CORS }
        });

      } catch (e) {
        return new Response(JSON.stringify({ error: e.message }), {
          status: 500,
          headers: { "content-type": "application/json", ...CORS }
        });
      }
    }



// 🎬 비디오 정보 업로드 (POST)
if (url.pathname === "/api/videos" && request.method === "POST") {
  const CORS = {
    "access-control-allow-origin": "*",
    "access-control-allow-headers": "content-type",
    "access-control-allow-methods": "GET,POST,DELETE,OPTIONS",
  };

  try {
    const body = await request.json();
    
    // 필수 값 검증
    if (!body.title || !body.filename) {
      return new Response(JSON.stringify({ error: "title and filename are required" }), {
        status: 400, headers: { "content-type": "application/json", ...CORS }
      });
    }

    // DB에 저장 (날짜는 DEFAULT CURRENT_TIMESTAMP로 자동 입력됨)
    await env.DB.prepare(`
      INSERT INTO videos (title, description, filename, uploader_id)
      VALUES (?, ?, ?, ?)
    `).bind(
      body.title,
      body.description || "",
      body.filename,
      body.uploader_id || 0
    ).run();

    return new Response(JSON.stringify({ ok: true }), {
      headers: { "content-type": "application/json", ...CORS }
    });

  } catch (e) {
    return new Response(JSON.stringify({ error: e.message }), {
      status: 500,
      headers: { "content-type": "application/json", ...CORS }
    });
  }
}


// ==========================================
// 🤖 젤GPT AI 챗봇 API (다국어 오염 방지 + 최근 경기 챔피언 팩폭 모드)
// ==========================================
if (url.pathname === '/api/chat' && request.method === 'POST') {
  const CORS_CHAT = {
    'access-control-allow-origin': '*',
    'access-control-allow-headers': 'content-type',
    'access-control-allow-methods': 'GET,POST,OPTIONS',
  };

  // 🧹 1. 한자 / 아랍어 / 중국어 오염 토큰 사후 정제 헬퍼 함수
  const sanitizeKoreanText = (text) => {
    if (!text) return "";
    return text
      .replace(/最近/g, "최근")
      .replace(/有点/g, "조금")
      .replace(/这样/g, "이렇게")
      .replace(/太/g, "너무")
      .replace(/很/g, "진짜")
      .replace(/的/g, "의")
      .replace(/了/g, "")
      .replace(/[\u4e00-\u9fff\u3400-\u4dbf\uF900-\uFAFF\u0600-\u06ff]/g, "")
      .trim();
  };

  try {
    const body = await request.json();
    const userMessages = Array.isArray(body.messages) ? body.messages : [];

    // 1. D1 활성 유저 목록 및 기본 정보 조회
    let playerRows = [];
    try {
      const { results } = await env.DB.prepare(`
        SELECT id, user_id, rating, rating_start, created_at, position_main, position_sub,
               COALESCE(nicknames, '') AS nicknames
        FROM players
        WHERE active = 1
        ORDER BY rating DESC
      `).all();
      playerRows = results || [];
    } catch (e) {
      const { results } = await env.DB.prepare(`
        SELECT id, user_id, rating, rating_start, created_at, position_main, position_sub
        FROM players
        WHERE active = 1
        ORDER BY rating DESC
      `).all();
      playerRows = results || [];
    }

    // 2. 최근 5개 경기 조회 (match_detail JSON 파싱)
    const { results: recentMatchesRaw } = await env.DB.prepare(`
      SELECT r.id, r.game_id, r.game_duration, r.result, r.time, r.match_detail,
             pb1.user_id AS b1, pb2.user_id AS b2, pb3.user_id AS b3, pb4.user_id AS b4, pb5.user_id AS b5,
             pr1.user_id AS r1, pr2.user_id AS r2, pr3.user_id AS r3, pr4.user_id AS r4, pr5.user_id AS r5
      FROM results r
      LEFT JOIN players pb1 ON r.blue1 = pb1.id
      LEFT JOIN players pb2 ON r.blue2 = pb2.id
      LEFT JOIN players pb3 ON r.blue3 = pb3.id
      LEFT JOIN players pb4 ON r.blue4 = pb4.id
      LEFT JOIN players pb5 ON r.blue5 = pb5.id
      LEFT JOIN players pr1 ON r.red1  = pr1.id
      LEFT JOIN players pr2 ON r.red2  = pr2.id
      LEFT JOIN players pr3 ON r.red3  = pr3.id
      LEFT JOIN players pr4 ON r.red4  = pr4.id
      LEFT JOIN players pr5 ON r.red5  = pr5.id
      ORDER BY r.id DESC
      LIMIT 5
    `).all();

    // 💡 주요 챔피언 ID -> 한글명 매핑 헬퍼
    const CHAMP_MAP = {
      1: "애니", 2: "올라프", 3: "갈리오", 4: "트위스티드 페이트", 5: "신 짜오", 6: "우르곳", 7: "르블랑", 8: "블라디미르",
      9: "피들스틱", 10: "케일", 11: "마스터 이", 12: "알리스타", 13: "라이즈", 14: "사이온", 15: "시비르", 16: "소라카",
      17: "티모", 18: "트리스타나", 19: "워윅", 20: "누누", 21: "미스 포츈", 22: "애쉬", 23: "트린다미어", 24: "잭스",
      25: "모르가나", 26: "질리언", 27: "신지드", 28: "이블린", 29: "트위치", 30: "카서스", 31: "초가스", 32: "아무무",
      33: "람머스", 34: "애니비아", 35: "샤코", 36: "문도 박사", 37: "소나", 38: "카사딘", 39: "이렐리아", 40: "잔나",
      41: "갱플랭크", 42: "코르키", 43: "카르마", 44: "타릭", 45: "베이가", 48: "트런들", 50: "스웨인", 51: "케이틀린",
      53: "블리츠크랭크", 54: "말파이트", 55: "카타리나", 56: "녹턴", 57: "마오카이", 58: "레넥톤", 59: "자르반 4세",
      60: "엘리스", 61: "오리아나", 62: "오공", 63: "브랜드", 64: "리 신", 67: "베인", 68: "럼블", 69: "카시오페아",
      74: "하이머딩거", 75: "나서스", 76: "니달리", 77: "우디르", 78: "뽀삐", 79: "그라가스", 80: "판테온", 81: "이즈리얼",
      82: "모데카이저", 83: "요릭", 84: "아칼리", 85: "케넨", 86: "가렌", 89: "레오나", 90: "말자하", 91: "탈론",
      92: "리븐", 96: "코그모", 98: "쉔", 99: "럭스", 101: "제라스", 102: "쉬바나", 103: "아리", 104: "그레이브즈",
      105: "피즈", 106: "볼리베어", 107: "렝가", 110: "바루스", 111: "노틸러스", 112: "빅토르", 113: "세주아니",
      114: "피오라", 115: "직스", 117: "룰루", 119: "드레이븐", 120: "헤카림", 121: "카직스", 122: "다리우스",
      126: "제이스", 127: "리산드라", 131: "다이애나", 133: "퀸", 134: "신드라", 136: "아우렐리온 솔", 141: "케인",
      142: "조이", 143: "자이라", 145: "카이사", 147: "세라핀", 150: "나르", 154: "자크", 157: "야스오", 161: "벨코즈",
      163: "탈리야", 164: "카밀", 166: "아크샨", 200: "벨베스", 201: "브라움", 202: "진", 203: "킨드레드", 221: "제리",
      222: "징크스", 223: "탐 켄치", 234: "비에고", 235: "세나", 236: "루시안", 238: "제드", 240: "클레드", 245: "에코",
      246: "키아나", 254: "바이", 266: "아트록스", 267: "나미", 268: "아지르", 350: "유미", 360: "사미라", 412: "쓰레쉬",
      420: "일라오이", 421: "렉사이", 427: "아이번", 429: "칼리스타", 432: "바드", 497: "라칸", 498: "자야", 516: "오른",
      517: "사일러스", 518: "니코", 523: "아펠리오스", 526: "렐", 555: "파이크", 711: "벡스", 777: "요네", 875: "세트",
      876: "릴리아", 887: "그웬", 888: "레나타 글라스크", 895: "닐라", 897: "크산테", 902: "밀리오", 910: "흐웨이",
      950: "나피리", 893: "오로라", 799: "암베사"
    };

    // 3. 최근 상세 경기 브리핑 텍스트 생성 (챔피언 이름 포함)
    const detailedGameBriefs = (recentMatchesRaw || []).map((m) => {
      let detail = null;
      try {
        detail = typeof m.match_detail === 'string' ? JSON.parse(m.match_detail) : m.match_detail;
      } catch (e) { detail = null; }

      const winnerStr = Number(m.result) === 1 ? 'BLUE팀 승리' : 'RED팀 승리';
      const durMin = Math.floor((m.game_duration || 0) / 60);
      const durSec = (m.game_duration || 0) % 60;
      const durStr = durMin > 0 ? `${durMin}분 ${durSec}초` : '시간 미상';

      if (!detail || !Array.isArray(detail.players) || detail.players.length === 0) {
        return `[경기 #${m.id}] (${winnerStr}, ${durStr})
- BLUE팀: ${[m.b1,m.b2,m.b3,m.b4,m.b5].filter(Boolean).join(', ')}
- RED팀: ${[m.r1,m.r2,m.r3,m.r4,m.r5].filter(Boolean).join(', ')}`;
      }

      const players = detail.players;
      const topDmgPlayer = [...players].sort((a,b) => (b.total_damage||0) - (a.total_damage||0))[0];
      const mostDeathPlayer = [...players].sort((a,b) => (b.deaths||0) - (a.deaths||0))[0];
      const topCsPlayer = [...players].sort((a,b) => (b.cs||0) - (a.cs||0))[0];

      const playerLines = players.map(p => {
        const teamTag = p.team === 'blue' ? 'BLUE' : 'RED';
        const isWin = (p.team === 'blue' && Number(m.result) === 1) || (p.team === 'red' && Number(m.result) === 2);
        const champName = CHAMP_MAP[p.champion_id] || `챔피언(ID:${p.champion_id})`;
        return `  * [${teamTag}] ${p.db_name} (플레이: [${champName}], ${isWin ? '승리' : '패배'}): KDA ${p.kills}/${p.deaths}/${p.assists}, 딜량 ${Number(p.total_damage||0).toLocaleString()}, CS ${p.cs||0}`;
      }).join('\n');

      return `[🔥 최근 경기 #${m.id}${m.game_id ? ` (롤 #${m.game_id})` : ''} - ${winnerStr} / ${durStr}]
- 딜량 1등 (캐리/MVP): ${topDmgPlayer?.db_name} (픽: ${CHAMP_MAP[topDmgPlayer?.champion_id] || '미상'}, 딜량 ${Number(topDmgPlayer?.total_damage||0).toLocaleString()})
- 최다 데스 (역적/데스왕): ${mostDeathPlayer?.db_name} (픽: ${CHAMP_MAP[mostDeathPlayer?.champion_id] || '미상'}, ${mostDeathPlayer?.deaths}데스)
- CS 1등: ${topCsPlayer?.db_name} (픽: ${CHAMP_MAP[topCsPlayer?.champion_id] || '미상'}, ${topCsPlayer?.cs}개)
- 10인 스탯 & 픽한 챔피언:
${playerLines}`;
    }).join('\n\n');

    // 4. 💡 [복구 완료] 전체 유저 요약 텍스트 (playersSummary)
    const POS_MAP = { 'T': '탑', 'J': '정글', 'M': '미드', 'A': '원딜', 'S': '서폿', '': '올라운더' };
    const playersSummary = (playerRows || []).map(p => {
      const nickText = p.nicknames ? ` (별명: ${p.nicknames})` : '';
      return `- ${p.user_id}${nickText}: 현재점수 ${p.rating}점 | 포지션: ${POS_MAP[(p.position_main||'').toUpperCase()]||'올라운더'}`;
    }).join('\n');

    // 5. 시스템 프롬프트 (챔피언 언급 필수 지침)
    const systemPrompt = {
      role: 'system',
      content: `너는 리그 오브 레전드(LoL) 5:5 내전 웹앱의 마스코트이자 악동 '젤GPT(자크)'다.

[⛔ 언어 및 문자 절대 원칙]
- 모든 답변은 반드시 100% 순수 한국어(한글), 숫자, 표준 특수문자, 이모지만 사용해라.
- 한자(漢字, 예: 这样, 有点, 最近 등), 중국어, 아랍어, 일본어 문자는 단 한 글자도 절대 출력하지 마라.

[핵심 정체성 & 말투]
- 깐족거리지만 미워할 수 없는 악동 자크 페르소나.
- 찰진 반말(~냐, ~함, ㅋㅋㅋ, ㄷㄷ 등)과 롤 은어(버스, 똥싸기, 딜량 꼴찌, 하드캐리, 역적, 숙련도) 사용.
- 답변은 2~3문장 내외로 직관적이고 강력하게 찌를 것.

[🔥 대화의 최우선 규칙: 챔피언 이름과 최근 경기 콕 찝어 언급하기]
1. 유저가 말을 걸면 [최근 인게임 경기 상세 데이터]에서 그 유저의 가장 최근 게임(#ID)을 찾고, **그 유저가 플레이한 '챔피언 이름'을 반드시 직접 언급**하며 대화해라.
2. 챔피언 특성과 경기 결과를 엮어서 찰지게 칭찬하거나 긁어라.
   - 캐리/딜량 1등: "너 지난 판(#ID)에 **[챔피언명]** 잡고 딜량 1등 찍으면서 하드캐리했더라? 웬일로 손가락 풀렸냐? ㅋㅋㅋ"
   - 다데스/역적: "야 너 저번 판(#ID)에 **[챔피언명]** 들고 7데스 박으면서 상대 맛집 오픈했더라? 챔피언한테 사과해라 ㅋㅋㅋ"
   - 버스 승리: "**[챔피언명]**으로 딜량 꼴찌 찍고 이겼던데 버스 승차감 안락했냐? ㅋㅋㅋ"
3. 상대방과의 매치업이나 라인전 상성도 챔피언 이름을 넣어 능청스럽게 비꼬거나 인정해줘라.

[유저 식별]
- 유저가 본인의 이름이나 줄임말, 별명(예: "나 댕댕이", "나 문어", "나 장군")을 말하면 목록에서 매칭해라.

[최근 인게임 경기 상세 데이터 (최우선 참조)]
${detailedGameBriefs}

[전체 유저 기본 정보]
${playersSummary}`
    };

    const fullMessages = [systemPrompt, ...userMessages.slice(-8)];

    let reply = '';
    if (env.AI) {
      const aiRes = await env.AI.run('@cf/meta/llama-3.3-70b-instruct-fp8-fast', {
        messages: fullMessages,
        max_tokens: 300,
      });
      reply = sanitizeKoreanText(aiRes.response || '어라? 소환사의 협곡 보느라 못 들었어 ㅋㅋㅋ 다시 말해줘!');
    } else {
      reply = '⚠️ Cloudflare Workers AI 바인딩이 필요합니다.';
    }

    return new Response(JSON.stringify({ ok: true, reply }), {
      headers: { 'content-type': 'application/json', ...CORS_CHAT },
    });

  } catch (err) {
    return new Response(JSON.stringify({ ok: false, error: err.message || 'AI 처리 오류' }), {
      status: 500,
      headers: { 'content-type': 'application/json', ...CORS_CHAT },
    });
  }
}


// ==========================================
// 🗑️ 3. 경기 삭제 및 점수/판수 롤백 API (DELETE /api/results)
// ==========================================
if (url.pathname === '/api/results' && request.method === 'DELETE') {
  const CORS = {
    'access-control-allow-origin': '*',
    'access-control-allow-headers': 'content-type, x-admin-pin',
    'access-control-allow-methods': 'GET,POST,DELETE,PATCH,OPTIONS'
  };

  const id = Number(url.searchParams.get('id'));
  const supplied = request.headers.get('x-admin-pin') || '';
  if (supplied !== ADMIN_PIN) {
    return new Response(JSON.stringify({ error: 'unauthorized' }), {
      status: 401, headers: { 'content-type': 'application/json', ...CORS }
    });
  }

  try {
    const rec = await env.DB.prepare(`SELECT * FROM results WHERE id = ?`).bind(id).first();
    if (!rec) {
      return new Response(JSON.stringify({ error: 'not_found' }), {
        status: 404, headers: { 'content-type': 'application/json', ...CORS }
      });
    }

    const blueIds = [rec.blue1, rec.blue2, rec.blue3, rec.blue4, rec.blue5].map(Number);
    const redIds  = [rec.red1, rec.red2, rec.red3, rec.red4, rec.red5].map(Number);
    const winner  = Number(rec.result) === 1 ? 'blue' : 'red';
    const now = new Date().toISOString().slice(0,19).replace('T',' ');

    const winIds  = (winner === 'blue') ? blueIds : redIds;
    const loseIds = (winner === 'blue') ? redIds  : blueIds;

    // 💡 players 테이블의 win, loose, rating 롤백
    for (const pid of winIds) {
      await env.DB.prepare(`
        UPDATE players
           SET win = MAX(0, COALESCE(win, 0) - 1),
               rating = COALESCE(rating, 0) - 1,
               last_updated = ?
         WHERE id = ?
      `).bind(now, pid).run();
    }

    for (const pid of loseIds) {
      await env.DB.prepare(`
        UPDATE players
           SET loose = MAX(0, COALESCE(loose, 0) - 1),
               rating = COALESCE(rating, 0) + 1,
               last_updated = ?
         WHERE id = ?
      `).bind(now, pid).run();
    }

    // results 테이블에서 해당 경기 삭제
    await env.DB.prepare(`DELETE FROM results WHERE id = ?`).bind(id).run();

    return new Response(JSON.stringify({ ok: true, id, undone: true }), {
      headers: { 'content-type': 'application/json', ...CORS }
    });

  } catch (e) {
    return new Response(JSON.stringify({ error: 'delete_failed', detail: String(e?.message||e) }), {
      status: 500, headers: { 'content-type': 'application/json', ...CORS }
    });
  }
}

// 🎮 피어리스 자동 등록 & 20시간 경과 자동 리셋 헬퍼
async function syncFearlessChampions(env, championIds) {
  if (!Array.isArray(championIds) || championIds.length === 0) return;

  const now = new Date();
  const nowStr = now.toISOString().slice(0, 19).replace('T', ' ');

  // 1) 20시간 경과 여부 검사 (마지막 픽 시각 기준)
  const lastPicked = await env.DB.prepare(
    "SELECT MAX(updated_at) AS last_time FROM champion_status WHERE status = 'picked'"
  ).first();

  if (lastPicked && lastPicked.last_time) {
    const lastTimeMs = new Date(lastPicked.last_time.replace(' ', 'T') + 'Z').getTime();
    const diffHours = (now.getTime() - lastTimeMs) / (1000 * 60 * 60);

    // 20시간 이상 지났으면 전체 초기화
    if (diffHours >= 20) {
      await env.DB.prepare(`
        UPDATE champion_status
           SET status = 'available', pick_order = 0, updated_at = ?
      `).bind(nowStr).run();
    }
  }

  // 2) 현재 픽 상태 및 순번(pick_order) 목록 조회
  const { results: existingChamps } = await env.DB.prepare(
    "SELECT champ_id, status, pick_order FROM champion_status"
  ).all();

  const champMap = new Map();
  const usedOrders = new Set();

  (existingChamps || []).forEach(row => {
    champMap.set(Number(row.champ_id), row);
    if (row.status === 'picked' && Number(row.pick_order) > 0) {
      usedOrders.add(Number(row.pick_order));
    }
  });

  // 3) 다음 빈 순번(pick_order) 탐색기
  let nextOrder = 1;
  const getNextAvailableOrder = () => {
    while (usedOrders.has(nextOrder)) {
      nextOrder++;
    }
    usedOrders.add(nextOrder);
    return nextOrder;
  };

  // 4) 10개 챔피언 등록 (이미 픽된 챔피언은 스킵)
  for (const cid of championIds) {
    const champId = Number(cid);
    if (!champId || isNaN(champId)) continue;

    const current = champMap.get(champId);
    if (current && current.status === 'picked' && Number(current.pick_order) > 0) {
      continue; // 이미 픽된 챔피언은 패스
    }

    const assignOrder = getNextAvailableOrder();

    if (current) {
      await env.DB.prepare(`
        UPDATE champion_status
           SET status = 'picked', pick_order = ?, updated_at = ?, ip = 'auto_sync'
         WHERE champ_id = ?
      `).bind(assignOrder, nowStr, champId).run();
    } else {
      await env.DB.prepare(`
        INSERT INTO champion_status (champ_id, status, pick_order, updated_at, ip)
        VALUES (?, 'picked', ?, ?, 'auto_sync')
      `).bind(champId, assignOrder, nowStr).run();
    }

    champMap.set(champId, { champ_id: champId, status: 'picked', pick_order: assignOrder });
  }
}


// =============================================================
// 🤖 디스코드 슬래시 커맨드 및 서명 검증 (/api/discord/interactions)
// =============================================================

// 💡 챔피언 ID -> 한글명 매핑
const CHAMP_MAP = {
  1: "애니", 2: "올라프", 3: "갈리오", 4: "트위스티드 페이트", 5: "신 짜오", 6: "우르곳", 7: "르블랑", 8: "블라디미르",
  9: "피들스틱", 10: "케일", 11: "마스터 이", 12: "알리스타", 13: "라이즈", 14: "사이온", 15: "시비르", 16: "소라카",
  17: "티모", 18: "트리스타나", 19: "워윅", 20: "누누", 21: "미스 포츈", 22: "애쉬", 23: "트린다미어", 24: "잭스",
  25: "모르가나", 26: "질리언", 27: "신지드", 28: "이블린", 29: "트위치", 30: "카서스", 31: "초가스", 32: "아무무",
  33: "람머스", 34: "애니비아", 35: "샤코", 36: "문도 박사", 37: "소나", 38: "카사딘", 39: "이렐리아", 40: "잔나",
  41: "갱플랭크", 42: "코르키", 43: "카르마", 44: "타릭", 45: "베이가", 48: "트런들", 50: "스웨인", 51: "케이틀린",
  53: "블리츠크랭크", 54: "말파이트", 55: "카타리나", 56: "녹턴", 57: "마오카이", 58: "레넥톤", 59: "자르반 4세",
  60: "엘리스", 61: "오리아나", 62: "오공", 63: "브랜드", 64: "리 신", 67: "베인", 68: "럼블", 69: "카시오페아",
  74: "하이머딩거", 75: "나서스", 76: "니달리", 77: "우디르", 78: "뽀삐", 79: "그라가스", 80: "판테온", 81: "이즈리얼",
  82: "모데카이저", 83: "요릭", 84: "아칼리", 85: "케넨", 86: "가렌", 89: "레오나", 90: "말자하", 91: "탈론",
  92: "리븐", 96: "코그모", 98: "쉔", 99: "럭스", 101: "제라스", 102: "쉬바나", 103: "아리", 104: "그레이브즈",
  105: "피즈", 106: "볼리베어", 107: "렝가", 110: "바루스", 111: "노틸러스", 112: "빅토르", 113: "세주아니",
  114: "피오라", 115: "직스", 117: "룰루", 119: "드레이븐", 120: "헤카림", 121: "카직스", 122: "다리우스",
  126: "제이스", 127: "리산드라", 131: "다이애나", 133: "퀸", 134: "신드라", 136: "아우렐리온 솔", 141: "케인",
  142: "조이", 143: "자이라", 145: "카이사", 147: "세라핀", 150: "나르", 154: "자크", 157: "야스오", 161: "벨코즈",
  163: "탈리야", 164: "카밀", 166: "아크샨", 200: "벨베스", 201: "브라움", 202: "진", 203: "킨드레드", 221: "제리",
  222: "징크스", 223: "탐 켄치", 234: "비에고", 235: "세나", 236: "루시안", 238: "제드", 240: "클레드", 245: "에코",
  246: "키아나", 254: "바이", 266: "아트록스", 267: "나미", 268: "아지르", 350: "유미", 360: "사미라", 412: "쓰레쉬",
  420: "일라오이", 421: "렉사이", 427: "아이번", 429: "칼리스타", 432: "바드", 497: "라칸", 498: "자야", 516: "오른",
  517: "사일러스", 518: "니코", 523: "아펠리오스", 526: "렐", 555: "파이크", 711: "벡스", 777: "요네", 875: "세트",
  876: "릴리아", 887: "그웬", 888: "레나타 글라스크", 895: "닐라", 897: "크산테", 902: "밀리오", 910: "흐웨이",
  950: "나피리", 893: "오로라", 799: "암베사"
};

// 🔐 Web Crypto API 기반 Ed25519 서명 검증 헬퍼
async function verifyDiscordSignature(request, rawBody, publicKey) {
  const signature = request.headers.get('X-Signature-Ed25519');
  const timestamp = request.headers.get('X-Signature-Timestamp');
  if (!signature || !timestamp || !publicKey) return false;

  try {
    const hexToBuf = (hex) => new Uint8Array(hex.match(/.{1,2}/g).map(byte => parseInt(byte, 16)));
    const key = await crypto.subtle.importKey(
      'raw',
      hexToBuf(publicKey),
      { name: 'NODE-ED25519', namedCurve: 'NODE-ED25519' },
      false,
      ['verify']
    );
    const data = new TextEncoder().encode(timestamp + rawBody);
    return await crypto.subtle.verify('NODE-ED25519', key, hexToBuf(signature), data);
  } catch {
    try {
      const hexToBuf = (hex) => new Uint8Array(hex.match(/.{1,2}/g).map(byte => parseInt(byte, 16)));
      const key = await crypto.subtle.importKey(
        'raw',
        hexToBuf(publicKey),
        { name: 'Ed25519' },
        false,
        ['verify']
      );
      const data = new TextEncoder().encode(timestamp + rawBody);
      return await crypto.subtle.verify('Ed25519', key, hexToBuf(signature), data);
    } catch {
      return false;
    }
  }
}

// 🎯 Discord 엔드포인트 라우트
if (url.pathname === '/api/discord/interactions' && request.method === 'POST') {
  const rawBody = await request.text();
  const publicKey = env.DISCORD_PUBLIC_KEY;

  const isValid = await verifyDiscordSignature(request, rawBody, publicKey);
  if (!isValid) {
    return new Response('Invalid request signature', { status: 401 });
  }

  const interaction = JSON.parse(rawBody);

  // 1) PING 핸드셰이크 처리 (Discord 포털 저장 시 즉시 통과)
  if (interaction.type === 1) {
    return json({ type: 1 });
  }

  // 2) 슬래시 명령어 처리
  if (interaction.type === 2) {
    const commandName = interaction.data?.name;
    const fearlessCommands = ['피어리스', '피어', '챔피언', '챔'];

    if (fearlessCommands.includes(commandName)) {
      const { results } = await env.DB.prepare(`
        SELECT champ_id, pick_order
        FROM champion_status
        WHERE status = 'picked' AND pick_order > 0
        ORDER BY pick_order ASC
      `).all();

      const totalCount = results ? results.length : 0;
      const fields = [];

      if (totalCount === 0) {
        fields.push({
          name: '📌 현재 사용(금지)된 챔피언',
          value: '> 현재 금지된 챔피언이 없습니다. **모든 챔피언을 선택할 수 있습니다.**',
          inline: false
        });
      } else {
        const setGroups = {};
        results.forEach(r => {
          const setNum = Math.floor((Number(r.pick_order) - 1) / 10) + 1;
          if (!setGroups[setNum]) setGroups[setNum] = [];
          const name = CHAMP_MAP[r.champ_id] || `챔피언 #${r.champ_id}`;
          setGroups[setNum].push(name);
        });

        Object.keys(setGroups).sort((a, b) => Number(a) - Number(b)).forEach(setNum => {
          const listStr = setGroups[setNum].map(c => `**${c}**`).join(' · ');
          fields.push({
            name: `━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n🚫 [ ${setNum}세트 사용 챔피언 ] (${setGroups[setNum].length}개 금지)`,
            value: `> ${listStr}\n\u200b`,
            inline: false
          });
        });
      }

      return json({
        type: 4,
        data: {
          embeds: [{
            title: `🚫 피어리스 밴픽 현황 (총 ${totalCount}개 금지)`,
            description: `### ⚠️ 아래 목록의 챔피언은 선택이 금지됩니다.\n\u200b`,
            color: 0xED4245,
            fields: fields,
            footer: { text: 'Fearless 밴픽 실시간 동기화 · 젤리의 내전 도우미 🐛' },
            timestamp: new Date().toISOString()
          }]
        }
      });
    }
  }

  return json({ error: 'Unknown interaction' }, 400);
}









// =============================================================
    // 📢 디스코드 알림 전송 API (피어리스 이미지 + 텍스트 동시 전송)
    // =============================================================
    if (url.pathname === '/api/discord/notify' && request.method === 'POST') {
      const CORS_DISCORD = {
        'access-control-allow-origin': '*',
        'access-control-allow-headers': 'content-type',
        'access-control-allow-methods': 'POST,OPTIONS',
      };

      try {
        const body = await request.json();
        const type = body.type; // 'team' | 'fearless'
        const targetWebhook = body.webhook_url || DISCORD_WEBHOOK_URL;

        if (!targetWebhook || targetWebhook.includes('여기에_디스코드_웹훅')) {
          return new Response(JSON.stringify({ error: '웹훅 URL이 설정되지 않았습니다.' }), {
            status: 400, headers: { 'content-type': 'application/json', ...CORS_DISCORD }
          });
        }

        // 1) ⚔️ 5:5 팀 분배 결과
        if (type === 'team') {
          const { blue, red, sumBlue, sumRed, diff, modeTitle = '실력별 팀 분배' } = body;
          
          const blueListStr = (blue || []).map(p => `> **${p.name}** \`(${p.rating}점)\`  ${p.pos ? `｜ **${p.pos}**` : ''}`).join('\n\n') || '> 명단 없음';
          const redListStr  = (red || []).map(p => `> **${p.name}** \`(${p.rating}점)\`  ${p.pos ? `｜ **${p.pos}**` : ''}`).join('\n\n') || '> 명단 없음';

          const discordPayload = {
            username: '젤리의 내전 도우미 🐛',
            avatar_url: 'https://raw.githubusercontent.com/twitter/twemoji/master/assets/72x72/1f41b.png',
            embeds: [{
              title: `⚔️ 5:5 소환사의 협곡 [${modeTitle}] 결과`,
              description: `### ⚖️ 팀 밸런스 점수 차이: \`${diff}점\`\n\u200b`,
              color: 0x5865F2,
              fields: [
                {
                  name: `━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n🟦 BLUE 팀  (총점: ${sumBlue}점)`,
                  value: `${blueListStr}\n\u200b`,
                  inline: false
                },
                {
                  name: `━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n🟥 RED 팀  (총점: ${sumRed}점)`,
                  value: `${redListStr}\n\u200b`,
                  inline: false
                }
              ],
              footer: {
                text: `소환사의 협곡 5:5 내전 · 젤리의 내전 도우미`
              },
              timestamp: new Date().toISOString()
            }]
          };

          const discordRes = await fetch(targetWebhook, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(discordPayload)
          });

          if (!discordRes.ok) {
            const errText = await discordRes.text();
            return new Response(JSON.stringify({ error: 'discord_send_failed', detail: errText }), {
              status: 500, headers: { 'content-type': 'application/json', ...CORS_DISCORD }
            });
          }

          return new Response(JSON.stringify({ ok: true }), {
            headers: { 'content-type': 'application/json', ...CORS_DISCORD }
          });
        } 
        // 2) 🚫 피어리스 밴픽 현황 (합성 이미지 + 세트별 텍스트 목록 동시 전송)
        else if (type === 'fearless') {
          const { totalCount, setGroups = {}, imageBase64 } = body;

          const fields = [];
          const setKeys = Object.keys(setGroups).sort((a,b) => Number(a) - Number(b));

          if (setKeys.length === 0) {
            fields.push({
              name: `📌 현재 사용(금지)된 챔피언`,
              value: `> 현재 밴된 챔피언이 없습니다. 모든 챔피언 선택 가능!`,
              inline: false
            });
          } else {
            setKeys.forEach(setNum => {
              const champs = setGroups[setNum] || [];
              const champNames = champs.map(c => typeof c === 'object' ? `**${c.name || c}**` : `**${c}**`).join(' · ');
              
              fields.push({
                name: `━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n🚫 [ ${setNum}세트 사용 챔피언 ]  (${champs.length}개 금지)`,
                value: `> ${champNames}\n\u200b`,
                inline: false
              });
            });
          }

          const payloadJson = {
            username: '젤리의 내전 도우미 🐛',
            avatar_url: 'https://raw.githubusercontent.com/twitter/twemoji/master/assets/72x72/1f41b.png',
            embeds: [{
              title: `🚫 피어리스 밴픽 현황 (총 ${totalCount}개 챔피언 사용됨)`,
              description: `### ⚠️ 이전 세트에 선택된 챔피언 목록\n> 아래 챔피언들은 선택이 금지됩니다.\n\u200b`,
              color: 0xED4245,
              fields: fields,
              image: imageBase64 ? { url: 'attachment://fearless_grid.png' } : undefined,
              footer: {
                text: `Fearless 밴픽 실시간 동기화 · 젤리의 내전 도우미`
              },
              timestamp: new Date().toISOString()
            }]
          };

          let fetchOptions = {};
          if (imageBase64) {
            const base64Data = imageBase64.replace(/^data:image\/\w+;base64,/, '');
            const binaryStr = atob(base64Data);
            const bytes = new Uint8Array(binaryStr.length);
            for (let i = 0; i < binaryStr.length; i++) {
              bytes[i] = binaryStr.charCodeAt(i);
            }
            const blob = new Blob([bytes], { type: 'image/png' });

            const formData = new FormData();
            formData.append('files[0]', blob, 'fearless_grid.png');
            formData.append('payload_json', JSON.stringify(payloadJson));

            fetchOptions = { method: 'POST', body: formData };
          } else {
            fetchOptions = {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(payloadJson)
            };
          }

          const discordRes = await fetch(targetWebhook, fetchOptions);

          if (!discordRes.ok) {
            const errText = await discordRes.text();
            return new Response(JSON.stringify({ error: 'discord_send_failed', detail: errText }), {
              status: 500, headers: { 'content-type': 'application/json', ...CORS_DISCORD }
            });
          }

          return new Response(JSON.stringify({ ok: true }), {
            headers: { 'content-type': 'application/json', ...CORS_DISCORD }
          });
        }

        return new Response(JSON.stringify({ error: 'invalid_type' }), {
          status: 400, headers: { 'content-type': 'application/json', ...CORS_DISCORD }
        });

      } catch (err) {
        return new Response(JSON.stringify({ error: String(err?.message || err) }), {
          status: 500, headers: { 'content-type': 'application/json', ...CORS_DISCORD }
        });
      }
    }


// 🚀 GET /api/app/version → 젤리 업로더 최신 버전 및 다운로드 웹 링크 반환
    if (url.pathname === "/api/app/version" && request.method === "GET") {
      return json({
        latest_version: "2.1.0", // 💡 새 버전 배포 시 이 버전을 올려주면 됨
        download_url: "https://jelly-lol.pages.dev/dist/JellyLoL_Setup.exe", // 💡 구글 드라이브 또는 다운로드 웹페이지 URL
        release_notes: "최종 아이템 7칸 수집 및 2026-2 시즌 전적 자동 동기화 패치"
      });
    }







// -------------------------------------------------------------
// PATCH /api/users/riot-id  { id: number, riot_id_1: string, riot_id_2: string, riot_id_3: string }
// -------------------------------------------------------------
if (url.pathname === '/api/users/riot-id' && request.method === 'PATCH') {
  const CORS = {
    'access-control-allow-origin': '*',
    'access-control-allow-headers': 'content-type',
    'access-control-allow-methods': 'GET,POST,DELETE,PATCH,OPTIONS',
  };
  try {
    const body = await request.json();
    const id = Number(body.id);
    const r1 = (body.riot_id_1 ?? '').toString().trim();
    const r2 = (body.riot_id_2 ?? '').toString().trim();
    const r3 = (body.riot_id_3 ?? '').toString().trim();

    if (!Number.isFinite(id) || id <= 0) {
      return new Response(JSON.stringify({ error: 'bad_id' }), { status: 400, headers: CORS });
    }

    const now = new Date().toISOString().slice(0, 19).replace('T', ' ');
    const upd = await env.DB.prepare(`
      UPDATE players
         SET riot_id_1 = ?, riot_id_2 = ?, riot_id_3 = ?, last_updated = ?
       WHERE id = ?
    `).bind(r1, r2, r3, now, id).run();

    if ((upd.changes ?? upd.meta?.changes ?? 0) === 0) {
      return new Response(JSON.stringify({ error: 'not_found' }), { status: 404, headers: CORS });
    }

    return new Response(JSON.stringify({ ok: true, id, riot_id_1: r1, riot_id_2: r2, riot_id_3: r3 }), {
      headers: { 'content-type': 'application/json', ...CORS }
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: 'update_failed', detail: String(e?.message || e) }), {
      status: 500, headers: CORS
    });
  }
}

    // async fetch() 내부의 진짜 최종 404 응답
    return new Response("Not found", { status: 404, headers: CORS });
  }, // fetch 함수 종료
}; // export default 종료


