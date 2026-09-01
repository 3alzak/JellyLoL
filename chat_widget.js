/**
 * 젤GPT LoL AI 챗봇 위젯 (chat_widget.js)
 * 페이지 이동 시 대화 내용 및 열림 상태 localStorage 유지
 */
(function () {
  const API_CHAT = 'https://wispy-recipe-b8f5.3alzak.workers.dev/api/chat';
  const STORAGE_KEY_MSG = 'jelly_chat_history';
  const STORAGE_KEY_OPEN = 'jelly_chat_is_open';

  // 1. CSS 스타일 동적 주입
  const style = document.createElement('style');
  style.textContent = `
    .jelly-chat-launcher {
      position: fixed;
      right: 22px;
      bottom: 22px;
      width: 54px;
      height: 54px;
      border-radius: 50%;
      background: #0f172a;
      border: 2px solid #3b82f6;
      box-shadow: 0 4px 16px rgba(0,0,0,0.3);
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 26px;
      z-index: 99999;
      transition: transform 0.2s cubic-bezier(0.34, 1.56, 0.64, 1), box-shadow 0.2s ease;
      user-select: none;
    }
    .jelly-chat-launcher:hover {
      transform: scale(1.1);
      box-shadow: 0 6px 20px rgba(59, 130, 246, 0.4);
    }
    .jelly-chat-window {
      position: fixed;
      right: 22px;
      bottom: 86px;
      width: 360px;
      max-width: calc(100vw - 44px);
      height: 500px;
      max-height: calc(100vh - 110px);
      background: #0f172a;
      border: 1px solid #1e293b;
      border-radius: 16px;
      box-shadow: 0 10px 30px rgba(0,0,0,0.4);
      display: flex;
      flex-direction: column;
      overflow: hidden;
      z-index: 99999;
      transition: opacity 0.2s ease, transform 0.2s ease, visibility 0.2s;
    }
    .jelly-chat-window.hidden {
      opacity: 0;
      visibility: hidden;
      transform: translateY(20px) scale(0.95);
      pointer-events: none;
    }
    .jelly-chat-header {
      background: #1e293b;
      color: #f8fafc;
      padding: 12px 16px;
      display: flex;
      align-items: center;
      justify-content: space-between;
      border-bottom: 1px solid #334155;
    }
    .jelly-chat-title {
      font-weight: 800;
      font-size: 15px;
      display: flex;
      align-items: center;
      gap: 6px;
    }
    .jelly-chat-controls button {
      background: none;
      border: none;
      color: #94a3b8;
      cursor: pointer;
      font-size: 14px;
      padding: 4px;
      border-radius: 4px;
      transition: color 0.15s;
    }
    .jelly-chat-controls button:hover { color: #f8fafc; }
    .jelly-chat-messages {
      flex: 1;
      padding: 14px;
      overflow-y: auto;
      display: flex;
      flex-direction: column;
      gap: 10px;
    }
    .jelly-msg {
      display: flex;
      flex-direction: column;
      max-width: 80%;
      word-break: break-word;
      font-size: 13.5px;
      line-height: 1.45;
    }
    .jelly-msg.user {
      align-self: flex-end;
      align-items: flex-end;
    }
    .jelly-msg.bot {
      align-self: flex-start;
      align-items: flex-start;
    }
    .jelly-msg-bubble {
      padding: 8px 12px;
      border-radius: 12px;
    }
    .jelly-msg.user .jelly-msg-bubble {
      background: #2563eb;
      color: #fff;
      border-bottom-right-radius: 2px;
    }
    .jelly-msg.bot .jelly-msg-bubble {
      background: #1e293b;
      color: #e2e8f0;
      border: 1px solid #334155;
      border-bottom-left-radius: 2px;
    }
    .jelly-chat-input-bar {
      padding: 10px 12px;
      background: #1e293b;
      border-top: 1px solid #334155;
      display: flex;
      gap: 8px;
    }
    .jelly-chat-input-bar input {
      flex: 1;
      background: #0b1220;
      border: 1px solid #334155;
      color: #f8fafc;
      padding: 8px 12px;
      border-radius: 8px;
      font-size: 13.5px;
      outline: none;
    }
    .jelly-chat-input-bar input:focus { border-color: #3b82f6; }
    .jelly-chat-input-bar button {
      background: #2563eb;
      color: #fff;
      border: none;
      padding: 8px 14px;
      border-radius: 8px;
      font-weight: 700;
      font-size: 13px;
      cursor: pointer;
    }
    .jelly-chat-input-bar button:hover { background: #1d4ed8; }
    .jelly-chat-input-bar button:disabled { background: #475569; cursor: not-allowed; }
  `;
  document.head.appendChild(style);

  // 2. DOM 요소 생성
  const launcher = document.createElement('div');
  launcher.className = 'jelly-chat-launcher';
  launcher.innerHTML = '🐛';
  launcher.title = '젤GPT 와 대화하기';

  const chatWin = document.createElement('div');
  chatWin.className = 'jelly-chat-window hidden';
  chatWin.innerHTML = `
    <div class="jelly-chat-header">
      <div class="jelly-chat-title"><span>🐛</span> 젤GPT AI</div>
      <div class="jelly-chat-controls">
        <button id="jellyChatClear" title="대화 지우기">🗑️</button>
        <button id="jellyChatClose" title="닫기">✕</button>
      </div>
    </div>
    <div class="jelly-chat-messages" id="jellyChatMessages"></div>
    <form class="jelly-chat-input-bar" id="jellyChatForm">
      <input type="text" id="jellyChatInput" placeholder="젤GPT 에게 질문하기..." autocomplete="off" />
      <button type="submit" id="jellyChatSend">전송</button>
    </form>
  `;

  document.body.appendChild(launcher);
  document.body.appendChild(chatWin);

  const msgContainer = chatWin.querySelector('#jellyChatMessages');
  const chatForm = chatWin.querySelector('#jellyChatForm');
  const chatInput = chatWin.querySelector('#jellyChatInput');
  const sendBtn = chatWin.querySelector('#jellyChatSend');
  const closeBtn = chatWin.querySelector('#jellyChatClose');
  const clearBtn = chatWin.querySelector('#jellyChatClear');

  // 3. 상태 관리 (localStorage)
  let messages = [];
  try {
    messages = JSON.parse(localStorage.getItem(STORAGE_KEY_MSG) || '[]');
  } catch { messages = []; }

  function saveMessages() {
    try { localStorage.setItem(STORAGE_KEY_MSG, JSON.stringify(messages)); } catch {}
  }

  function renderMessages() {
    msgContainer.innerHTML = '';
    if (messages.length === 0) {
      msgContainer.innerHTML = `
        <div class="jelly-msg bot">
          <div class="jelly-msg-bubble">안녕! 난 젤GPT야. 내전에 대해 궁금한 거 있으면 뭐든 물어봐 ㅋㅋㅋ</div>
        </div>
      `;
      return;
    }
    messages.forEach(m => {
      const div = document.createElement('div');
      div.className = `jelly-msg ${m.role === 'user' ? 'user' : 'bot'}`;
      div.innerHTML = `<div class="jelly-msg-bubble">${m.content}</div>`;
      msgContainer.appendChild(div);
    });
    msgContainer.scrollTop = msgContainer.scrollHeight;
  }

  function toggleChat(forceState) {
    const isHidden = chatWin.classList.contains('hidden');
    const targetOpen = typeof forceState === 'boolean' ? forceState : isHidden;

    if (targetOpen) {
      chatWin.classList.remove('hidden');
      localStorage.setItem(STORAGE_KEY_OPEN, 'true');
      setTimeout(() => chatInput.focus(), 50);
    } else {
      chatWin.classList.add('hidden');
      localStorage.setItem(STORAGE_KEY_OPEN, 'false');
    }
  }

  // 4. 이벤트 바인딩
  launcher.addEventListener('click', () => toggleChat());
  closeBtn.addEventListener('click', () => toggleChat(false));
  clearBtn.addEventListener('click', () => {
    if (confirm('대화 기록을 모두 지울까요?')) {
      messages = [];
      saveMessages();
      renderMessages();
    }
  });

  chatForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const text = chatInput.value.trim();
    if (!text) return;

    // 유저 메시지 추가
    messages.push({ role: 'user', content: text });
    saveMessages();
    renderMessages();
    chatInput.value = '';

    // 로딩 상태
    sendBtn.disabled = true;
    chatInput.disabled = true;

    try {
      const res = await fetch(API_CHAT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages })
      });
      const data = await res.json();
      const reply = data.ok ? data.reply : `오류: ${data.error || '응답 실패'}`;
      messages.push({ role: 'assistant', content: reply });
    } catch (err) {
      messages.push({ role: 'assistant', content: '서버와 연결할 수 없어 ㅠㅠ' });
    } finally {
      saveMessages();
      renderMessages();
      sendBtn.disabled = false;
      chatInput.disabled = false;
      chatInput.focus();
    }
  });

  // 5. 초기 복원 실행
  renderMessages();
  if (localStorage.getItem(STORAGE_KEY_OPEN) === 'true') {
    toggleChat(true);
  }
})();