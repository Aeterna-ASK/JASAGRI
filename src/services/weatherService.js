/**
 * weatherService.js
 * Firebase Cloud Function (getWeather) 経由で Open-Meteo データを取得する。
 * サーバーサイドフェッチにより CORS・広告ブロッカーの影響を受けない。
 * 霧島市の座標: 緯度 31.7292, 経度 130.7614
 */

const WEATHER_CF_URL = 'https://asia-northeast1-organiclog-2f6c7.cloudfunctions.net/getWeather';

const KIRISHIMA_LAT = 31.7292;
const KIRISHIMA_LON = 130.7614;

/**
 * 天気コードを日本語の概要に変換する
 */
const getWeatherSummary = (code) => {
  if (code === 0) return '快晴';
  if (code <= 2) return '晴れ';
  if (code === 3) return '曇り';
  if (code <= 49) return '霧';
  if (code <= 57) return '霧雨';
  if (code <= 67) return '雨';
  if (code <= 77) return '雪';
  if (code <= 82) return 'にわか雨';
  if (code <= 99) return '雷雨';
  return '不明';
};

/**
 * 霧島市の現在の天気と週間予報を取得する
 * @returns {Promise<Object>} 天気データオブジェクト
 */
export const fetchWeather = async () => {
  const res = await fetch(WEATHER_CF_URL, { signal: AbortSignal.timeout(20000) });
  if (!res.ok) throw new Error(`Weather API error: ${res.status}`);
  const data = await res.json();

  const today = new Date();
  const formatDate = (dateStr) => {
    const d = new Date(dateStr);
    return `${d.getMonth() + 1}/${d.getDate()}`;
  };
  const getDayName = (dateStr) => {
    const days = ['日', '月', '火', '水', '木', '金', '土'];
    return days[new Date(dateStr).getDay()];
  };

  // 降水確率（各6時間帯の中間時刻で代表値を取得）
  const precipitationSlots = [
    { time: '06-12', hourIndex: 9 },
    { time: '12-18', hourIndex: 15 },
    { time: '18-00', hourIndex: 21 },
  ];
  const precipitation = precipitationSlots.map((slot, i) => ({
    id: i + 1,
    time: slot.time,
    chance: data.hourly.precipitation_probability[slot.hourIndex] ?? 0,
  }));

  // 週間予報（今日を除く翌日から）
  const weeklyForecast = data.daily.time.slice(1, 6).map((date) => {
    const idx = data.daily.time.indexOf(date);
    return {
      date: formatDate(date),
      day: getDayName(date),
      summary: getWeatherSummary(data.daily.weathercode[idx]),
      tempHigh: Math.round(data.daily.temperature_2m_max[idx]),
      tempLow: Math.round(data.daily.temperature_2m_min[idx]),
      chance: data.daily.precipitation_probability_max[idx] ?? 0,
    };
  });

  return {
    location: '鹿児島県 霧島市',
    date: `${today.getFullYear()}年${today.getMonth() + 1}月${today.getDate()}日`,
    summary: getWeatherSummary(data.current.weathercode),
    tempHigh: Math.round(data.daily.temperature_2m_max[0]),
    tempLow: Math.round(data.daily.temperature_2m_min[0]),
    precipitation,
    weeklyForecast,
  };
};
