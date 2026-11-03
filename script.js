// 인증키는 브라우저에 노출하지 않고 /api/dust 서버 함수에서 사용합니다

// 생성된 Chart.js 차트 인스턴스를 저장하기 위한 전역 변수입니다
let chartInstance = null;
let activeRequestId = 0;

// HTML DOM 요소들이 모두 로드된 후 스크립트 실행을 개시합니다
document.addEventListener('DOMContentLoaded', () => {
  // 시도 선택 드롭다운 요소 참조를 가져옵니다
  const sidoSelect = document.getElementById('sidoSelect');
  
  // 드롭다운 변경 이벤트 발생 시 선택된 시도의 데이터를 재조회합니다
  sidoSelect.addEventListener('change', (e) => {
    fetchAirData(e.target.value);
  });

  // 초기 실행 시 기본 선택값('서울') 데이터 조회를 시작합니다
  fetchAirData(sidoSelect.value);
});

// 지정한 시도의 대기오염 데이터를 API로 요청하고 처리하는 함수입니다
async function fetchAirData(sidoName) {
  const requestId = ++activeRequestId;
  const errorEl = document.getElementById('errorMessage');
  errorEl.hidden = true;
  errorEl.textContent = '';

  // 데이터 불러오기 전 로딩 박스를 화면에 표시합니다
  showLoading(true);

  try {
    // 동일 출처의 Vercel 서버리스 경로를 통해 데이터를 요청합니다
    const response = await fetch(`/api/dust?sido=${encodeURIComponent(sidoName)}`);
    const data = await response.json().catch(() => null);
    if (!response.ok) {
      const error = new Error(data?.message || `서버 응답 오류: ${response.status}`);
      error.status = response.status;
      throw error;
    }
    if (data?.response?.header?.resultCode !== '00') {
      throw new Error(data?.response?.header?.resultMsg || '대기오염 정보를 불러오지 못했습니다.');
    }

    if (requestId !== activeRequestId) return;
    
    // API 응답 구조에서 측정소별 데이터 배열을 추출합니다
    const items = data?.response?.body?.items || [];

    // 가져온 데이터를 기반으로 UI 요소들을 업데이트합니다
    updateUI(sidoName, items);

  } catch (error) {
    if (requestId !== activeRequestId) return;
    const message = error.status === 404
      ? '대기질 API 경로를 찾지 못했습니다. Vercel에서 dust 폴더를 프로젝트 루트로 배포했는지 확인해주세요.'
      : error.message || '대기오염 데이터를 불러오지 못했습니다.';
    errorEl.textContent = message;
    errorEl.hidden = false;
    updateHeroSignal(sidoName, null, '');
    document.getElementById('heroNotice').textContent = '데이터 연결 상태와 배포 설정을 확인해주세요.';
    document.getElementById('stationGrid').replaceChildren();
    renderChart([]);
  } finally {
    if (requestId === activeRequestId) {
      showLoading(false);
    }
  }
}

// 로딩 스피너 보이기/숨기기 토글 함수입니다
function showLoading(isLoading) {
  const loadingEl = document.getElementById('loading');
  loadingEl.style.display = isLoading ? 'flex' : 'none';
}

// 화면 UI 전체를 업데이트하는 메인 함수입니다
function updateUI(sidoName, items) {
  // 1. 유효한 미세먼지 수치를 바탕으로 시도 전체 평균값을 계산합니다
  const validPm10Values = items
    .map(item => parseInt(item.pm10Value, 10))
    .filter(val => !isNaN(val)); // '-' 등 비숫자 데이터는 수치 계산에서 제외합니다

  // 유효한 측정소들의 평균 PM10 값을 산출합니다
  const avgPm10 = validPm10Values.length > 0 
    ? Math.round(validPm10Values.reduce((acc, cur) => acc + cur, 0) / validPm10Values.length)
    : null;

  // 가장 최근 데이터의 측정 시각을 가져옵니다
  const latestDataTime = items.length > 0 ? items[0].dataTime : '';

  // 2. 상단 공기 신호등(Hero Card) 화면 업데이트
  updateHeroSignal(sidoName, avgPm10, latestDataTime);

  // 3. 수치 기준 상위 10개 측정소 가로 막대 그래프 생성
  renderChart(items);

  // 4. 개별 측정소 카드 그리드 생성
  renderStationCards(items);
}

// 미세먼지(PM10) 수치 기반 4단계 등급 정보를 반환하는 헬퍼 함수입니다
function getGradeInfo(pm10Value) {
  if (pm10Value === null || isNaN(pm10Value)) {
    return { grade: 0, text: '측정 안 됨', emoji: '⚪', notice: '측정 정보가 부족합니다.', color: '#9ca3af', class: 'grade-unknown' };
  }
  const val = Number(pm10Value);
  if (val <= 30) {
    return { grade: 1, text: '좋음', emoji: '🔵', notice: '😊 공기 상태가 쾌적합니다. 야외 활동하기 좋은 날이에요!', color: '#3b82f6', class: 'grade-1' };
  } else if (val <= 80) {
    return { grade: 2, text: '보통', emoji: '🟢', notice: '🙂 무난한 공기 상태입니다. 환기하기에 적당합니다.', color: '#10b981', class: 'grade-2' };
  } else if (val <= 150) {
    return { grade: 3, text: '나쁨', emoji: '🟠', notice: '😷 외출 시 마스크를 챙기세요! 장시간 야외활동을 자제하세요.', color: '#f97316', class: 'grade-3' };
  } else {
    return { grade: 4, text: '매우나쁨', emoji: '🔴', notice: '🚨 외출 시 마스크를 꼭 챙기세요! 야외활동을 피하시는 것이 좋습니다.', color: '#ef4444', class: 'grade-4' };
  }
}

// 에어코리아 API가 제공하는 pm10Grade 숫자 코드(1~4)를 바탕으로 정보를 반환하는 함수입니다
function getGradeInfoByCode(gradeCode) {
  switch (String(gradeCode)) {
    case '1': return { text: '좋음', emoji: '🔵', color: '#3b82f6', class: 'grade-1' };
    case '2': return { text: '보통', emoji: '🟢', color: '#10b981', class: 'grade-2' };
    case '3': return { text: '나쁨', emoji: '🟠', color: '#f97316', class: 'grade-3' };
    case '4': return { text: '매우나쁨', emoji: '🔴', color: '#ef4444', class: 'grade-4' };
    default: return { text: '정보 없음', emoji: '⚪', color: '#9ca3af', class: 'grade-unknown' };
  }
}

// 날짜 형식("YYYY-MM-DD HH:mm")을 "YYYY년 MM월 DD일 HH시 기준" 한국어 문자열로 변환합니다
function formatKoreanDate(dataTimeString) {
  if (!dataTimeString) return '시각 정보 없음';
  
  // 정규표현식으로 연, 월, 일, 시 요소를 추출합니다
  const match = dataTimeString.match(/^(\d{4})-(\d{2})-(\d{2})\s+(\d{2}):/);
  if (match) {
    const [_, year, month, day, hour] = match;
    return `${year}년 ${parseInt(month, 10)}월 ${parseInt(day, 10)}일 ${parseInt(hour, 10)}시 기준`;
  }
  return `${dataTimeString} 기준`; // 추출 실패 시 원본 문자열을 리턴
}

// 메인 히어로 카드(공기 신호등) UI 업데이트 함수입니다
function updateHeroSignal(sidoName, avgPm10, dataTime) {
  const heroCard = document.getElementById('heroCard');
  const heroEmoji = document.getElementById('heroEmoji');
  const heroGradeText = document.getElementById('heroGradeText');
  const heroAvgValue = document.getElementById('heroAvgValue');
  const heroNotice = document.getElementById('heroNotice');
  const dataTimeEl = document.getElementById('dataTime');

  // 한국어 스타일 날짜 표기로 변환하여 출력합니다
  dataTimeEl.textContent = formatKoreanDate(dataTime);

  // 수치에 맞는 등급 정보를 계산해옵니다
  const info = getGradeInfo(avgPm10);

  // 공기 신호등 구성 요소 반영
  heroEmoji.textContent = info.emoji;
  heroGradeText.textContent = info.text;
  heroAvgValue.innerHTML = avgPm10 !== null ? `${avgPm10} <small>㎍/㎥</small>` : `측정 안 됨`;
  heroNotice.textContent = info.notice;

  // 카드의 CSS 등급 클래스를 업데이트하여 테두리와 배경색을 지정합니다
  heroCard.className = `hero-card ${info.class}`;
}

// Chart.js 기반 수치 상위 10개 측정소 가로 막대 그래프 그리기 함수입니다
function renderChart(items) {
  const canvas = document.getElementById('airChart');
  const chartError = document.getElementById('chartError');

  // 수치가 유효한 측정소만 필터링한 후 PM10 높은 순으로 정렬합니다
  const sortedItems = items
    .filter(item => item.pm10Value && item.pm10Value !== '-' && !isNaN(parseInt(item.pm10Value, 10)))
    .map(item => ({
      name: item.stationName,
      val: parseInt(item.pm10Value, 10),
      gradeInfo: getGradeInfo(parseInt(item.pm10Value, 10))
    }))
    .sort((a, b) => b.val - a.val) // 내림차순 정렬
    .slice(0, 10); // 상위 10개만 추출

  // 라벨 배열 및 데이터 수치 배열 준비
  const labels = sortedItems.map(i => i.name);
  const dataValues = sortedItems.map(i => i.val);
  const barColors = sortedItems.map(i => i.gradeInfo.color);

  // 기존 생성된 차트 인스턴스가 존재할 경우 제거하여 캔버스를 초기화합니다
  if (chartInstance) {
    chartInstance.destroy();
    chartInstance = null;
  }

  if (sortedItems.length === 0) {
    canvas.hidden = true;
    chartError.textContent = '표시할 미세먼지 수치가 없습니다.';
    chartError.hidden = false;
    return;
  }

  if (typeof Chart === 'undefined') {
    canvas.hidden = true;
    chartError.textContent = '그래프 라이브러리를 불러오지 못했습니다. 측정소 목록은 계속 확인할 수 있습니다.';
    chartError.hidden = false;
    return;
  }

  canvas.hidden = false;
  chartError.hidden = true;
  const ctx = canvas.getContext('2d');

  // 새로운 가로 막대 차트(Horizontal Bar Chart) 생성
  chartInstance = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: labels,
      datasets: [{
        label: '미세먼지 (PM10 ㎍/㎥)',
        data: dataValues,
        backgroundColor: barColors, // 등급별 지정 색상 적용
        borderRadius: 6,           // 막대 모서리 둥글게
        barThickness: 18           // 막대 두께 조정
      }]
    },
    options: {
      indexAxis: 'y', // 가로 막대그래프로 설정
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false }, // 범례 숨김
        tooltip: {
          callbacks: {
            label: (ctx) => ` 미세먼지: ${ctx.parsed.x} ㎍/㎥`
          }
        }
      },
      scales: {
        x: {
          beginAtZero: true,
          grid: { color: '#f3f4f6' }
        },
        y: {
          grid: { display: false }
        }
      }
    }
  });
}

// 측정소별 상세 카드를 생성하여 그리드에 추가하는 함수입니다
function renderStationCards(items) {
  const grid = document.getElementById('stationGrid');
  grid.innerHTML = ''; // 기존 카드 목록 초기화

  if (!items || items.length === 0) {
    grid.innerHTML = '<p style="grid-column: 1/-1; text-align: center; color: #6b7280;">측정소 데이터가 없습니다.</p>';
    return;
  }

  // 각 측정소 데이터를 순회하며 HTML 카드 요소 생성
  items.forEach(item => {
    const card = document.createElement('div');
    
    // API의 등급 코드(pm10Grade) 정보 추출
    const gradeInfo = getGradeInfoByCode(item.pm10Grade);

    // 등급 색상을 카드의 테두리 및 은은한 배경색으로 반영합니다
    card.className = `station-card ${gradeInfo.class}`;

    // 결측치('-')에 대한 표시 문자열 변환
    const pm10Display = (item.pm10Value && item.pm10Value !== '-') ? `${item.pm10Value} ㎍/㎥` : '측정 안 됨';
    const pm25Display = (item.pm25Value && item.pm25Value !== '-') ? `${item.pm25Value} ㎍/㎥` : '측정 안 됨';

    // 카드 내부 요소 구성 HTML
    card.innerHTML = `
      <div class="station-name">
        <span>📍 ${item.stationName}</span>
        <span>${gradeInfo.emoji}</span>
      </div>
      <div class="station-time">${formatKoreanDate(item.dataTime)}</div>
      <div class="stat-row">
        <span>미세먼지 (PM10)</span>
        <span class="val">${pm10Display}</span>
      </div>
      <div class="stat-row">
        <span>초미세먼지 (PM2.5)</span>
        <span class="val">${pm25Display}</span>
      </div>
    `;

    // 생성된 카드를 그리드 컨테이너에 추가합니다
    grid.appendChild(card);
  });
}