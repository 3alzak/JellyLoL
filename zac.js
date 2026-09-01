// zac.js : 자크 생성 및 물리엔진 통합본
(function() {
  
  // 1. 자크 이미지와 스타일을 강제로 주입하는 함수
  function injectZacAssets() {
    // 이미 있으면 패스 (중복 생성 방지)
    if (document.getElementById('floatingZac')) return;

    // (1) 스타일 주입
    const style = document.createElement('style');
    style.innerHTML = `
      #floatingZac, #jumpingZac {
        position: fixed;
        top: 0; left: 0;
        width: 150px;
        height: auto;
        z-index: -1; /* 제일 아래 */
        pointer-events: none; /* 클릭 통과 */
        will-change: transform;
        filter: drop-shadow(2px 4px 6px rgba(0,0,0,0.3));
        display: block; /* 무조건 보임 */
      }
    `;
    document.head.appendChild(style);

    // (2) 이미지 주입
    const z1 = document.createElement('img');
    z1.id = 'floatingZac';
    z1.src = '/img/balloonzac.gif'; // 경로 확인 필요!
    z1.alt = '풍선 자크';
    
    const z2 = document.createElement('img');
    z2.id = 'jumpingZac';
    z2.src = '/img/jumzac.gif';    // 경로 확인 필요!
    z2.alt = '점프 자크';

    document.body.appendChild(z1);
    document.body.appendChild(z2);

    return [z1, z2];
  }

  // 2. 물리 엔진 시작
  function init() {
    // 자산 주입 실행
    injectZacAssets();

    const z1 = document.getElementById('floatingZac');
    const z2 = document.getElementById('jumpingZac');

    if (!z1 || !z2) return; // 만약 이미지 로드 실패시 중단

    // 움직임 설정
    startZacAnimation([
      { id: 'floatingZac', el: z1, x: 0, y: 0, angle: Math.random() * 6.28, speed: 0.3 },
      { id: 'jumpingZac',  el: z2, x: 0, y: 0, angle: Math.random() * 6.28, speed: 0.5 }
    ]);
  }

  function startZacAnimation(zacs) {
    const turnSpeed = 0.05;
    const size = 150; 

    // 초기 위치 랜덤 배정 (화면 밖으로 안 나가게)
    zacs.forEach((z, i) => {
      const maxX = window.innerWidth - size;
      const maxY = window.innerHeight - size;
      z.x = Math.random() * maxX;
      z.y = Math.random() * maxY;
    });

    function animate() {
      zacs.forEach(z => {
        // 이동
        z.angle += (Math.random() - 0.5) * turnSpeed;
        z.x += Math.cos(z.angle) * z.speed;
        z.y += Math.sin(z.angle) * z.speed;

        // 벽 튕기기
        const maxWidth = window.innerWidth - z.el.clientWidth;
        const maxHeight = window.innerHeight - z.el.clientHeight;

        if (z.x < 0) { z.x = 0; z.angle = Math.PI - z.angle; }
        else if (z.x > maxWidth) { z.x = maxWidth; z.angle = Math.PI - z.angle; }
        
        if (z.y < 0) { z.y = 0; z.angle = -z.angle; }
        else if (z.y > maxHeight) { z.y = maxHeight; z.angle = -z.angle; }
      });

      // 자크끼리 충돌 (물리)
      const z1 = zacs[0];
      const z2 = zacs[1];
      const dx = (z1.x + size/2) - (z2.x + size/2);
      const dy = (z1.y + size/2) - (z2.y + size/2);
      const dist = Math.sqrt(dx*dx + dy*dy);
      
      if (dist < size * 0.8) {
        const angle = Math.atan2(dy, dx);
        z1.angle = angle;
        z2.angle = angle + Math.PI;
        
        const push = 3.0;
        z1.x += Math.cos(z1.angle) * push;
        z1.y += Math.sin(z1.angle) * push;
        z2.x += Math.cos(z2.angle) * push;
        z2.y += Math.sin(z2.angle) * push;
      }

      // 그리기
      zacs.forEach(z => {
        z.el.style.transform = `translate3d(${z.x}px, ${z.y}px, 0)`;
      });

      requestAnimationFrame(animate);
    }
    
    animate();
  }

  // DOM이 준비되면 실행
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();