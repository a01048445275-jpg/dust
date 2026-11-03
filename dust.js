// 에어코리아 API를 호출해 결과를 프런트엔드에 전달합니다.
module.exports = async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ message: 'GET 요청만 지원합니다.' });
  }

  const serviceKey = process.env.AIRKOREA_KEY;
  if (!serviceKey) {
    return res.status(500).json({ message: 'AIRKOREA_KEY 환경변수가 설정되지 않았습니다.' });
  }

  const sido = typeof req.query.sido === 'string' && req.query.sido.trim()
    ? req.query.sido.trim()
    : '서울';
  const apiUrl = 'https://apis.data.go.kr/B552584/ArpltnInforInqireSvc/getCtprvnRltmMesureDnsty'
    + `?serviceKey=${encodeURIComponent(serviceKey)}`
    + `&returnType=json&sidoName=${encodeURIComponent(sido)}`
    + '&numOfRows=100&pageNo=1&ver=1.3';

  try {
    const upstreamResponse = await fetch(apiUrl);
    const responseText = await upstreamResponse.text();
    let data;

    try {
      data = JSON.parse(responseText);
    } catch {
      return res.status(502).json({ message: '인증키 또는 요청값을 확인해주세요.' });
    }

    if (data?.response?.header?.resultCode !== '00') {
      return res.status(502).json({ message: '에어코리아 응답 오류입니다. 인증키 또는 요청값을 확인해주세요.' });
    }
    if (!upstreamResponse.ok) {
      return res.status(502).json({ message: '에어코리아 요청에 실패했습니다.' });
    }

    return res.status(200).json(data);
  } catch {
    return res.status(502).json({ message: '에어코리아 서버에 연결할 수 없습니다.' });
  }
};