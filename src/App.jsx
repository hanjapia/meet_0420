import React, { useState, useEffect, useMemo } from 'react';
import { initializeApp } from 'firebase/app';
import { 
  getFirestore, 
  collection, 
  doc, 
  onSnapshot, 
  deleteDoc, 
  setDoc,
  updateDoc,
  deleteField
} from 'firebase/firestore';
import { 
  getAuth, 
  signInAnonymously, 
  signInWithCustomToken, 
  onAuthStateChanged 
} from 'firebase/auth';
import { 
  ChevronLeft, 
  ChevronRight, 
  User, 
  CheckCircle2, 
  Users, 
  LogOut, 
  AlertCircle,
  RefreshCw,
  Check,
  CalendarDays,
  MessageCircle,
  ExternalLink,
  MapPin, Clock, Edit2, Save, X, PlusCircle, Image as ImageIcon, Lock, LockOpen, Link as LinkIcon, Trash2
} from 'lucide-react';

// --- Firebase 설정 ---
const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY || "AIzaSyB4yveiNGCcBq0eMZgrioodT_YLWCBmFmk",
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || "meet-test01.firebaseapp.com",
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID || "meet-test01",
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET || "meet-test01.firebasestorage.app",
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || "796785536307",
  appId: import.meta.env.VITE_FIREBASE_APP_ID || "1:796785536307:web:abac00f2c591ba10692246",
  measurementId: import.meta.env.VITE_FIREBASE_MEASUREMENT_ID || "G-XP0J2D80HG"
};

// --- 카카오 설정 ---
const KAKAO_CONFIG = {
  jsKey: import.meta.env.VITE_KAKAO_JS_KEY || "719c6c176e8541aba9184d3c42ff36be",
  restApiKey: import.meta.env.VITE_KAKAO_REST_API_KEY || "c5d2d36011ec0f9c0f628958f7376e25",
  adminKey: import.meta.env.VITE_KAKAO_ADMIN_KEY || "419efc7833ef42133f79b910456294c9",
  clientSecret: import.meta.env.VITE_KAKAO_CLIENT_SECRET || "H4DS8iuSLMIUgcOdtiUevI5RqqPKR4fb",
  businessSecret: import.meta.env.VITE_KAKAO_BUSINESS_SECRET || "H5EmBVclcbQa8Y3DioJqUo8vKCuu1gCq"
};

// 파이어베이스 서비스 초기화
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

const searchParams = new URLSearchParams(window.location.search);
const appId = searchParams.get('id') || (typeof __app_id !== 'undefined' ? __app_id : 'meet-test01-calendar');

// --- 이름별 고유 배지 색상 생성 함수 (밝은 파스텔톤, 명암 변화) ---
const getBadgeStyle = (name) => {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  
  // 고유한 색상(Hue), 채도(Saturation), 명도(Lightness)를 계산하여 밝은 파스텔톤 생성
  const h = Math.abs(hash) % 360;
  const s = 65 + (Math.abs(hash) % 25); // 65% ~ 90%
  const l = 75 + (Math.abs(hash) % 20); // 75% ~ 95% (밝은 계열 내에서 명암 차이)

  return {
    backgroundColor: `hsl(${h}, ${s}%, ${l}%)`,
    color: '#1e293b' // 텍스트는 가독성을 위해 짙은 색
  };
};

const App = () => {
  const [user, setUser] = useState(null);
  const [authError, setAuthError] = useState(null);
  const [userName, setUserName] = useState('');
  const [isNameSet, setIsNameSet] = useState(false);
  const [activeProfiles, setActiveProfiles] = useState([]);
  const [currentDate, setCurrentDate] = useState(new Date());
  const [availabilityData, setAvailabilityData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [isUpdating, setIsUpdating] = useState(false);
  const [kakaoLoaded, setKakaoLoaded] = useState(false);

  const [isAdmin, setIsAdmin] = useState(false);
  const [showAdminModal, setShowAdminModal] = useState(false);
  const [allMeetings, setAllMeetings] = useState([]);

  const [meetingInfo, setMeetingInfo] = useState({
    title: '따뜻한 만남, 일정 조율',
    description: '모임 성격과 설명을 입력해주세요.',
    location: '',
    time: '',
    imageUrl: ''
  });
  const [isEditingInfo, setIsEditingInfo] = useState(false);
  const [tempMeetingInfo, setTempMeetingInfo] = useState({});

  // 1. 파이어베이스 인증 설정 (Rule 3)
  useEffect(() => {

    const initAuth = async () => {
      try {
        setLoading(true);
        if (typeof __initial_auth_token !== 'undefined' && __initial_auth_token) {
          try {
            await signInWithCustomToken(auth, __initial_auth_token);
          } catch (e) {
            await signInAnonymously(auth);
          }
        } else {
          await signInAnonymously(auth);
        }
      } catch (error) {
        console.error("인증 오류:", error);
        setAuthError("인증 오류가 발생했습니다. 파이어베이스 콘솔에서 익명 로그인을 활성화해주세요.");
      } finally {
        setLoading(false);
      }
    };
    initAuth();

    const unsubscribe = onAuthStateChanged(auth, setUser);
    return () => unsubscribe();
  }, []);

  // 2. 카카오 SDK 초기화
  useEffect(() => {
    const script = document.createElement('script');
    script.src = 'https://t1.kakaocdn.net/kakao_js_sdk/2.7.0/kakao.min.js';
    script.onload = () => {
      if (window.Kakao) {
        if (!window.Kakao.isInitialized()) {
          window.Kakao.init(KAKAO_CONFIG.jsKey);
        }
        setKakaoLoaded(true);
      }
    };
    document.head.appendChild(script);
  }, []);

  // 3. 실시간 데이터 페칭 (Rule 1 & 2)
  useEffect(() => {
    if (!user) return;

    const availabilityRef = collection(db, 'artifacts', appId, 'public', 'data', 'availability');
    
    const unsubscribe = onSnapshot(availabilityRef, (snapshot) => {
      const data = snapshot.docs.map(doc => ({
        date: doc.id,
        participants: doc.data().participants || {}
      }));
      setAvailabilityData(data);
    }, (error) => {
      console.error("데이터베이스 리스닝 오류:", error);
    });

    return () => unsubscribe();
  }, [user]);

  // 메타데이터 리스닝
  useEffect(() => {
    if (!user) return;
    const infoRef = doc(db, 'artifacts', appId, 'public', 'data', 'metadata', 'info');
    const unsubInfo = onSnapshot(infoRef, (docSnap) => {
      if (docSnap.exists()) {
        setMeetingInfo(docSnap.data());
      }
    });
    return () => unsubInfo();
  }, [user]);

  // 관리자 모드: 전체 모임 목록 리스닝
  useEffect(() => {
    if (!showAdminModal || !user) return;
    
    const meetingsRef = collection(db, 'artifacts', 'global-registry', 'public', 'data', 'meetings');
    const unsub = onSnapshot(meetingsRef, (snapshot) => {
      const list = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
      list.sort((a, b) => new Date(b.updatedAt || 0) - new Date(a.updatedAt || 0));
      setAllMeetings(list);
    });
    
    return () => unsub();
  }, [showAdminModal, user]);

  // 카카오톡 공유 실행 함수
  const shareToKakao = () => {
    if (!window.Kakao || !kakaoLoaded) return;

    window.Kakao.Share.sendDefault({
      objectType: 'feed',
      content: {
        title: meetingInfo.title || '🗓️ 모임 일정 조율 요청',
        description: meetingInfo.description || `${userName}님이 보낸 일정 캘린더입니다. 가능한 날짜를 확인하고 성함을 등록해 주세요!`,
        imageUrl: 'https://images.unsplash.com/photo-1506784983877-45594efa4cbe?auto=format&fit=crop&q=80&w=600',
        link: {
          mobileWebUrl: window.location.href,
          webUrl: window.location.href,
        },
      },
      social: {
        subscriberCount: availabilityData.length,
      },
      buttons: [
        {
          title: '참여 가능 날짜 등록하기',
          link: {
            mobileWebUrl: window.location.href,
            webUrl: window.location.href,
          },
        },
      ],
    });
  };

  const copyMeetingLink = () => {
    navigator.clipboard.writeText(window.location.href);
    alert('모임 접속 주소가 복사되었습니다!\n원하는 곳에 붙여넣기(Ctrl+V) 하세요.');
  };

  const createNewMeeting = async () => {
    const meetingTitle = prompt("새로운 모임의 이름을 입력하세요:");
    if (!meetingTitle || meetingTitle.trim() === '') return;

    const randomId = 'meet-' + Math.random().toString(36).substr(2, 9);
    try {
       const registryRef = doc(db, 'artifacts', 'global-registry', 'public', 'data', 'meetings', randomId);
       await setDoc(registryRef, {
         id: randomId,
         title: meetingTitle.trim(),
         updatedAt: new Date().toISOString()
       }, { merge: true });

       const infoRef = doc(db, 'artifacts', randomId, 'public', 'data', 'metadata', 'info');
       await setDoc(infoRef, {
         title: meetingTitle.trim(),
         description: '새로 만들어진 모임입니다. (관리자에서 생성됨)',
         location: '',
         time: '',
         imageUrl: ''
       }, { merge: true });
    } catch(e) { console.error(e); }
    window.location.href = `/?id=${randomId}`;
  };

  const deleteMeeting = async (meetingId, e) => {
    e.preventDefault();
    if (window.confirm("정말로 이 모임을 삭제하시겠습니까?\n삭제하면 복구할 수 없으며 목록에서 사라집니다.")) {
      try {
        await deleteDoc(doc(db, 'artifacts', 'global-registry', 'public', 'data', 'meetings', meetingId));
      } catch (err) {
        console.error("삭제 실패:", err);
        alert("모임 삭제 중 오류가 발생했습니다.");
      }
    }
  };

  // 캘린더 계산 로직
  const daysInMonth = (year, month) => new Date(year, month + 1, 0).getDate();
  const firstDayOfMonth = (year, month) => new Date(year, month, 1).getDay();

  const handlePrevMonth = () => setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() - 1, 1));
  const handleNextMonth = () => setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 1));

  const saveMeetingInfo = async () => {
    setIsUpdating(true);
    try {
      const infoRef = doc(db, 'artifacts', appId, 'public', 'data', 'metadata', 'info');
      await setDoc(infoRef, tempMeetingInfo, { merge: true });
      
      const registryRef = doc(db, 'artifacts', 'global-registry', 'public', 'data', 'meetings', appId);
      await setDoc(registryRef, {
        id: appId,
        title: tempMeetingInfo.title || '이름 없는 모임',
        updatedAt: new Date().toISOString()
      }, { merge: true });

      setIsEditingInfo(false);
    } catch (e) {
      console.error(e);
    } finally {
      setIsUpdating(false);
    }
  };

  const handleAdminLogin = () => {
    if (isAdmin) {
      setShowAdminModal(true);
      return;
    }
    const pwd = prompt("관리자 비밀번호를 입력하세요:");
    if (pwd === "1234") {
      setIsAdmin(true);
      setShowAdminModal(true);
    } else if (pwd !== null) {
      alert("비밀번호가 틀렸습니다.");
    }
  };

  // 날짜별 참여 여부 토글 (날짜별 문서 저장 방식)
  const toggleAvailability = async (day) => {
    if (!isNameSet || !userName) return;

    const dateStr = `${currentDate.getFullYear()}-${String(currentDate.getMonth() + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    const dateDocRef = doc(db, 'artifacts', appId, 'public', 'data', 'availability', dateStr);
    
    const existingDateEntry = availabilityData.find(d => d.date === dateStr);
    
    let keyToDelete = null;
    if (existingDateEntry?.participants) {
      if (existingDateEntry.participants[userName] === true) {
        keyToDelete = userName;
      } else {
        const oldEntry = Object.entries(existingDateEntry.participants).find(([k, v]) => v === userName);
        if (oldEntry) keyToDelete = oldEntry[0];
      }
    }

    const isAlreadyParticipating = !!keyToDelete;

    setIsUpdating(true);
    try {
      if (isAlreadyParticipating) {
        await updateDoc(dateDocRef, {
          [`participants.${keyToDelete}`]: deleteField()
        });
      } else {
        await setDoc(dateDocRef, {
          participants: {
            [userName]: true
          }
        }, { merge: true });
      }
    } catch (error) {
      console.error("데이터 동기화 오류:", error);
    } finally {
      setIsUpdating(false);
    }
  };

  const calendarDays = useMemo(() => {
    const year = currentDate.getFullYear();
    const month = currentDate.getMonth();
    const totalDays = daysInMonth(year, month);
    const startDay = firstDayOfMonth(year, month);
    const days = [];
    for (let i = 0; i < startDay; i++) days.push(null);
    for (let i = 1; i <= totalDays; i++) days.push(i);
    return days;
  }, [currentDate]);

  const monthName = currentDate.toLocaleString('ko-KR', { month: 'long', year: 'numeric' });

  // 총 참여 인원 계산 및 명단 추출
  const participantNames = useMemo(() => {
    const names = new Set();
    availabilityData.forEach(day => {
      Object.entries(day.participants || {}).forEach(([name, val]) => {
        if (val === true || typeof val === 'string') names.add(val === true ? name : val);
      });
    });
    return Array.from(names);
  }, [availabilityData]);
  const totalParticipantsCount = participantNames.length;

  const maxParticipantsCount = useMemo(() => {
    let max = 0;
    availabilityData.forEach(day => {
      const [y, m] = day.date.split('-');
      if (parseInt(y) === currentDate.getFullYear() && parseInt(m) === currentDate.getMonth() + 1) {
        const count = Object.values(day.participants || {}).filter(v => v === true || typeof v === 'string').length;
        if (count > max) max = count;
      }
    });
    return max;
  }, [availabilityData, currentDate]);

  // 바탕화면 색상 동적 결정 (인라인 스타일 사용으로 확실한 적용)
  const bgColorHash = useMemo(() => {
    if (!userName) return '#f8fafc';
    const bgColors = [
      '#fff1f2', '#fff7ed', '#fffbeb', '#f7fee7', '#f0fdf4', 
      '#ecfdf5', '#f0fdfa', '#ecfeff', '#f0f9ff', '#eff6ff', 
      '#eef2ff', '#f5f3ff', '#faf5ff', '#fdf4ff', '#fdf2f8'
    ];
    let hash = 0;
    for (let i = 0; i < userName.length; i++) {
      hash = userName.charCodeAt(i) + ((hash << 5) - hash);
    }
    return bgColors[Math.abs(hash) % bgColors.length];
  }, [userName]);

  // 이름 입력 화면 (게이트웨이)
  if (!isNameSet) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4 text-slate-800 transition-colors duration-500 relative" style={{ backgroundColor: bgColorHash }}>
        {/* 관리자 자물쇠 버튼 (우측 하단 고정) */}
        <button onClick={handleAdminLogin} className="absolute bottom-6 right-6 text-slate-400 hover:text-slate-600 transition-colors bg-white/50 backdrop-blur p-3 rounded-full shadow-sm z-50" title="관리자 메뉴">
          {isAdmin ? <LockOpen size={18} /> : <Lock size={18} />}
        </button>

        <div className="bg-white p-8 rounded-[2.5rem] shadow-2xl w-full max-w-md border border-slate-100 z-10">
          <div className="flex flex-col items-center mb-8">
            <img src={meetingInfo.imageUrl || "/coffee_gathering.png"} alt="모임 배너" className="w-full h-48 object-cover rounded-2xl mb-6 shadow-md bg-slate-100" />
            <div className="bg-blue-600 p-4 rounded-2xl text-white mb-4 shadow-lg shadow-blue-200">
              <Users size={32} />
            </div>
            <h1 className="text-2xl font-bold text-center">{meetingInfo.title}</h1>
            <p className="text-slate-500 mt-2 text-center text-sm whitespace-pre-line">{meetingInfo.description}</p>
            {(meetingInfo.location || meetingInfo.time) && (
              <div className="flex flex-col gap-2 w-full mt-4 bg-slate-50 p-4 rounded-xl border border-slate-100">
                {meetingInfo.location && <div className="flex items-center gap-2 text-sm text-slate-700"><MapPin size={16} className="text-blue-500"/> {meetingInfo.location}</div>}
                {meetingInfo.time && <div className="flex items-center gap-2 text-sm text-slate-700"><Clock size={16} className="text-blue-500"/> {meetingInfo.time}</div>}
              </div>
            )}

            {/* 현재 모임 주소 복사 버튼 */}
            <button onClick={copyMeetingLink} type="button" className="flex items-center justify-center gap-2 w-full mt-4 bg-slate-100 hover:bg-slate-200 text-slate-600 font-bold py-3 rounded-2xl transition-all text-sm">
              <LinkIcon size={16} /> 이 모임 주소 복사하기
            </button>

            <p className="text-blue-600 mt-6 text-center text-sm font-bold">성함을 입력하고 입장해 주세요.</p>
          </div>
          
          <form onSubmit={(e) => { 
            e.preventDefault(); 
            const trimmed = userName.trim();
            if(trimmed) {
              setUserName(trimmed);
              setIsNameSet(true);
              setActiveProfiles(prev => prev.includes(trimmed) ? prev : [...prev, trimmed]);
            }
          }} className="space-y-4">
            <input 
              autoFocus required type="text" placeholder="본인의 이름을 입력하세요"
              className="w-full px-5 py-4 bg-slate-50 border-2 border-slate-100 rounded-2xl focus:border-blue-500 focus:bg-white focus:outline-none transition-all text-lg"
              value={userName} onChange={(e) => setUserName(e.target.value)}
            />
            <button 
              type="submit" disabled={loading || !user || authError}
              className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-slate-200 text-white font-bold py-4 rounded-2xl transition-all flex items-center justify-center gap-2 text-lg shadow-lg shadow-blue-100"
            >
              {loading ? <RefreshCw size={22} className="animate-spin" /> : "입장하기"}
            </button>
          </form>

          {authError && (
            <div className="mt-6 p-4 bg-red-50 border border-red-100 rounded-xl flex items-start gap-3 text-red-600 text-xs">
              <AlertCircle size={16} className="shrink-0 mt-0.5" />
              <p>{authError}</p>
            </div>
          )}
        </div>
      </div>
    );
  }

  // 메인 대시보드
  return (
    <div className="min-h-screen p-4 md:p-8 font-sans text-slate-800 transition-colors duration-500" style={{ backgroundColor: bgColorHash }}>
      <div className="max-w-6xl mx-auto">
        {/* 상단 주소 복사 및 카카오톡 공유 행 */}
        <div className="flex items-center justify-end gap-3 mb-4 w-full">
          <button 
            onClick={copyMeetingLink}
            className="bg-white text-blue-600 px-4 py-2.5 rounded-2xl font-bold flex items-center gap-2 shadow-sm border border-slate-100 hover:bg-slate-50 transition-all text-sm"
            title="이 모임의 주소를 복사합니다"
          >
            <LinkIcon size={18} />
            <span>주소 복사</span>
          </button>
          <button 
            onClick={shareToKakao}
            disabled={!kakaoLoaded}
            className="bg-[#FEE500] text-[#191919] px-4 py-2.5 rounded-2xl font-bold flex items-center gap-2 shadow-sm hover:brightness-95 transition-all text-sm disabled:opacity-50"
          >
            <MessageCircle size={18} fill="currentColor" />
            <span>카톡 공유하기</span>
          </button>
        </div>

        <div className="mb-8 w-full h-48 md:h-64 rounded-[2.5rem] overflow-hidden shadow-lg relative bg-slate-100">
          <img src={meetingInfo.imageUrl || "/coffee_gathering.png"} alt="모임 배너" className="w-full h-full object-cover opacity-90" />
          <div className="absolute inset-0 bg-gradient-to-t from-slate-900/80 via-slate-900/30 to-transparent p-6 md:p-8 flex flex-col justify-end">
            <div className="flex justify-between items-end">
              <div className="text-white max-w-3xl">
                <h1 className="text-3xl md:text-4xl font-bold drop-shadow-md mb-2">{meetingInfo.title}</h1>
                <p className="text-sm md:text-base text-slate-200 mb-4 whitespace-pre-line drop-shadow">{meetingInfo.description}</p>
                <div className="flex flex-wrap gap-4">
                  {meetingInfo.location && <span className="flex items-center gap-1.5 text-sm font-medium bg-white/20 px-3 py-1.5 rounded-full backdrop-blur-sm"><MapPin size={14}/> {meetingInfo.location}</span>}
                  {meetingInfo.time && <span className="flex items-center gap-1.5 text-sm font-medium bg-white/20 px-3 py-1.5 rounded-full backdrop-blur-sm"><Clock size={14}/> {meetingInfo.time}</span>}
                </div>
              </div>
              <button onClick={() => { setTempMeetingInfo(meetingInfo); setIsEditingInfo(true); }} className="bg-white/20 hover:bg-white/30 backdrop-blur-sm text-white p-2.5 rounded-xl transition-all" title="모임 정보 수정">
                <Edit2 size={18} />
              </button>
            </div>
          </div>
        </div>
        <div className="flex flex-col lg:flex-row justify-between items-center mb-8 gap-6">
          <div className="flex items-center gap-3 w-full lg:w-auto">
            {/* 총 참여 인원 및 인원 추가 합친 블록 */}
            <div className="flex flex-col gap-3 bg-white p-4 rounded-2xl shadow-sm border border-slate-100 w-full lg:min-w-[320px]">
              <div className="flex items-center justify-between gap-4 w-full">
                <div className="flex items-center gap-2 font-bold text-sm text-slate-700">
                  <Users size={18} className="text-blue-600" />
                  <span>총 {totalParticipantsCount}명 참여 중</span>
                </div>
                <button 
                  onClick={() => {
                    const newName = prompt("추가할 인원의 성함을 입력하세요:");
                    if (newName && newName.trim()) {
                      const trimmed = newName.trim();
                      setUserName(trimmed);
                      setActiveProfiles(prev => prev.includes(trimmed) ? prev : [...prev, trimmed]);
                    }
                  }} 
                  className="px-3 py-1.5 text-blue-600 bg-blue-50 hover:bg-blue-100 rounded-xl transition-colors text-xs font-bold flex items-center gap-1 shadow-sm"
                  title="새로운 인원 추가"
                >
                  <PlusCircle size={14} /> 이름입력하여 참여하기
                </button>
              </div>
              {Array.from(new Set([...activeProfiles, ...participantNames])).length > 0 && (
                <div className="flex flex-wrap gap-2 mt-1 w-full">
                  {Array.from(new Set([...activeProfiles, ...participantNames])).map(name => {
                    const isSelected = userName === name;
                    const baseStyle = getBadgeStyle(name);
                    return (
                      <button 
                        key={name}
                        onClick={() => setUserName(name)}
                        className={`text-[12px] px-3 py-1.5 rounded-xl font-bold shadow-sm transition-all flex items-center gap-1 ${
                          isSelected 
                            ? 'ring-2 ring-blue-400 ring-offset-1 scale-105 z-10 opacity-100' 
                            : 'hover:scale-105 opacity-70 hover:opacity-100'
                        }`}
                        style={isSelected ? { backgroundColor: '#2563eb', color: 'white' } : baseStyle}
                        title={`${name} 프로필로 선택`}
                      >
                        {isSelected && <Check size={12} />}
                        {name}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

          </div>

          <div className="flex items-center gap-3 bg-white p-2.5 rounded-[1.5rem] shadow-sm border border-slate-100">
            <button onClick={handlePrevMonth} className="p-2.5 hover:bg-slate-100 rounded-xl transition-all"><ChevronLeft size={22} /></button>
            <h2 className="px-4 font-bold text-xl min-w-[160px] text-center tracking-tight">{monthName}</h2>
            <button onClick={handleNextMonth} className="p-2.5 hover:bg-slate-100 rounded-xl transition-all"><ChevronRight size={22} /></button>
          </div>

        </div>

        {/* 캘린더 그리드 */}
        <div className="bg-white rounded-[2.5rem] shadow-2xl shadow-slate-200/40 overflow-hidden border border-slate-100 transition-all">
          <div className="grid grid-cols-7 bg-slate-50/70 border-b border-slate-100">
            {['일', '월', '화', '수', '목', '금', '토'].map((day, idx) => (
              <div key={day} className={`py-5 text-center text-xs font-black tracking-widest ${idx === 0 ? 'text-red-400' : idx === 6 ? 'text-blue-400' : 'text-slate-400'}`}>
                {day}
              </div>
            ))}
          </div>
          
          <div className="grid grid-cols-7 md:auto-rows-[minmax(140px,auto)] auto-rows-[minmax(110px,auto)]">
            {calendarDays.map((day, index) => {
              if (!day) return <div key={`empty-${index}`} className="bg-slate-50/20 border-b border-r border-slate-50"></div>;
              
              const dateStr = `${currentDate.getFullYear()}-${String(currentDate.getMonth() + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
              const dayEntry = availabilityData.find(d => d.date === dateStr);
              const participants = dayEntry 
                ? Object.entries(dayEntry.participants).map(([k, v]) => v === true ? k : v) 
                : [];
              const isMySelection = participants.includes(userName);
              const isToday = new Date().toDateString() === new Date(currentDate.getFullYear(), currentDate.getMonth(), day).toDateString();
              const isMax = maxParticipantsCount > 1 && participants.length === maxParticipantsCount;

              return (
                <div 
                  key={day}
                  onClick={() => !isUpdating && toggleAvailability(day)}
                  className={`relative p-3 border-b border-r border-slate-50 cursor-pointer transition-all hover:z-10 group 
                    ${isMySelection ? 'bg-blue-50/30' : 'hover:bg-slate-50/80'}
                    ${isMax && !isMySelection ? 'bg-orange-50/40 ring-inset ring-2 ring-orange-200' : ''}
                    ${isUpdating ? 'cursor-wait opacity-80' : ''}
                  `}
                >
                  <div className="flex justify-between items-start mb-2">
                    <span className={`text-base font-black w-9 h-9 flex items-center justify-center rounded-2xl transition-all z-10
                      ${isToday ? 'bg-slate-900 text-white shadow-lg scale-110' : 'text-slate-700'} 
                      ${isMySelection ? 'bg-blue-600 text-white shadow-blue-200 shadow-xl' : ''}
                      ${isMax && !isMySelection && !isToday ? 'text-orange-700' : ''}
                    `}>
                      {day}
                    </span>
                    <div className="flex flex-col items-end gap-1.5 z-10">
                      {isMax && (
                        <div className="text-[10px] font-black text-orange-600 bg-orange-100 border border-orange-200 px-1.5 py-0.5 rounded shadow-sm animate-pulse">
                          BEST 🔥
                        </div>
                      )}
                      {participants.length > 0 && (
                        <div className="flex items-center gap-1 text-[10px] font-black text-blue-600 bg-blue-100/50 px-2 py-0.5 rounded-full shadow-sm">
                          <Users size={10} />
                          {participants.length}
                        </div>
                      )}
                    </div>
                  </div>
                  
                  {/* 날짜별 가능한 사람 명단 (2열 배치, 5줄 초과 시 스크롤) */}
                  <div className="grid grid-cols-2 gap-1 mt-3 max-h-[140px] overflow-y-auto pr-1">
                    {participants.map((name, i) => (
                      <div 
                        key={`${name}-${i}`} 
                        className={`text-[10px] px-1.5 py-1 rounded-md font-bold truncate text-center transition-all animate-in fade-in slide-in-from-bottom-1 shadow-sm
                          ${name === userName ? 'ring-2 ring-offset-1 ring-slate-400' : ''}
                        `}
                        style={getBadgeStyle(name)}
                        title={name}
                      >
                        {name}
                      </div>
                    ))}
                  </div>

                  {/* 마우스 호버 안내 */}
                  <div className="absolute inset-0 border-2 border-transparent group-hover:border-blue-200/50 rounded-2xl pointer-events-none transition-all m-1.5"></div>
                </div>
              );
            })}
          </div>
        </div>

        {/* 상태 및 푸터 정보 */}
        <div className="mt-10 flex flex-col md:flex-row items-center justify-between gap-6 px-8 py-10 bg-white rounded-[2rem] border border-slate-100 shadow-sm">
          <div className="flex items-center gap-4">
            <div className="bg-green-100 p-3 rounded-full">
              <CheckCircle2 size={24} className="text-green-600" />
            </div>
            <div>
              <p className="text-base font-bold text-slate-700">실시간 데이터 연동 활성</p>
              <p className="text-sm text-slate-400">모든 변경사항이 즉시 서버에 동기화되고 있습니다.</p>
            </div>
          </div>
          
          <div className="flex flex-wrap items-center gap-4">
            <div className="flex items-center gap-2 text-xs font-mono text-slate-300">
              <CalendarDays size={14} />
              <span>Collection: availability</span>
            </div>
            <div className="flex items-center gap-2 text-xs font-mono text-slate-300">
              <ExternalLink size={14} />
              <span>Kakao SDK: v2.7.0</span>
            </div>
            <button onClick={handleAdminLogin} className="text-slate-300 hover:text-slate-500 transition-colors" title="관리자 메뉴">
              {isAdmin ? <LockOpen size={14} /> : <Lock size={14} />}
            </button>
          </div>
        </div>
      </div>
      {/* 모임 정보 수정 모달 */}
      {isEditingInfo && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-white w-full max-w-lg rounded-[2rem] shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-200">
            <div className="flex justify-between items-center p-6 border-b border-slate-100">
              <h2 className="text-xl font-bold text-slate-800">모임 정보 설정</h2>
              <button onClick={() => setIsEditingInfo(false)} className="text-slate-400 hover:text-slate-600 p-2 rounded-xl hover:bg-slate-100 transition-colors">
                <X size={20} />
              </button>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-bold text-slate-700 mb-1.5 flex items-center gap-1"><ImageIcon size={14}/> 배너 이미지 주소 (선택)</label>
                <input type="text" className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:border-blue-500 focus:ring-2 focus:ring-blue-200 outline-none transition-all text-sm"
                  value={tempMeetingInfo.imageUrl || ''} onChange={e => setTempMeetingInfo({...tempMeetingInfo, imageUrl: e.target.value})} placeholder="https://example.com/image.jpg" />
              </div>
              <div>
                <label className="block text-sm font-bold text-slate-700 mb-1.5">모임 제목</label>
                <input type="text" className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:border-blue-500 focus:ring-2 focus:ring-blue-200 outline-none transition-all"
                  value={tempMeetingInfo.title || ''} onChange={e => setTempMeetingInfo({...tempMeetingInfo, title: e.target.value})} />
              </div>
              <div>
                <label className="block text-sm font-bold text-slate-700 mb-1.5">모임 설명 및 성격</label>
                <textarea className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:border-blue-500 focus:ring-2 focus:ring-blue-200 outline-none transition-all h-24 resize-none"
                  value={tempMeetingInfo.description || ''} onChange={e => setTempMeetingInfo({...tempMeetingInfo, description: e.target.value})} placeholder="어떤 모임인지 자세히 적어주세요." />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-bold text-slate-700 mb-1.5 flex items-center gap-1"><MapPin size={14}/> 장소</label>
                  <input type="text" className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:border-blue-500 focus:ring-2 focus:ring-blue-200 outline-none transition-all"
                    value={tempMeetingInfo.location || ''} onChange={e => setTempMeetingInfo({...tempMeetingInfo, location: e.target.value})} placeholder="강남역 스타벅스" />
                </div>
                <div>
                  <label className="block text-sm font-bold text-slate-700 mb-1.5 flex items-center gap-1"><Clock size={14}/> 시간</label>
                  <input type="text" className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:border-blue-500 focus:ring-2 focus:ring-blue-200 outline-none transition-all"
                    value={tempMeetingInfo.time || ''} onChange={e => setTempMeetingInfo({...tempMeetingInfo, time: e.target.value})} placeholder="오후 7시" />
                </div>
              </div>
            </div>
            <div className="p-6 bg-slate-50 border-t border-slate-100 flex gap-3 justify-end">
              <button onClick={() => setIsEditingInfo(false)} className="px-5 py-2.5 rounded-xl font-bold text-slate-600 hover:bg-slate-200 transition-colors">취소</button>
              <button onClick={saveMeetingInfo} disabled={isUpdating} className="px-5 py-2.5 rounded-xl font-bold bg-blue-600 text-white hover:bg-blue-700 transition-colors flex items-center gap-2">
                {isUpdating ? <RefreshCw size={18} className="animate-spin"/> : <Save size={18}/>} 저장하기
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 관리자 전체 모임 목록 모달 */}
      {showAdminModal && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4 z-[60]">
          <div className="bg-white w-full max-w-2xl rounded-[2rem] shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-200 flex flex-col max-h-[80vh]">
            <div className="flex justify-between items-center p-6 border-b border-slate-100 bg-slate-50">
              <h2 className="text-xl font-bold text-slate-800 flex items-center gap-2">
                <LockOpen className="text-blue-600" size={24} /> 전체 모임 관리 (Admin)
              </h2>
              <button onClick={() => setShowAdminModal(false)} className="text-slate-400 hover:text-slate-600 p-2 rounded-xl hover:bg-slate-200 transition-colors">
                <X size={20} />
              </button>
            </div>
            <div className="bg-white border-b border-slate-100 p-4 shadow-sm z-10">
              <button onClick={createNewMeeting} className="w-full bg-blue-50 text-blue-600 hover:bg-blue-100 font-bold py-3.5 rounded-xl transition-all flex items-center justify-center gap-2 shadow-sm shadow-blue-100/50">
                <PlusCircle size={18} /> 새로운 모임(약속) 만들기
              </button>
            </div>
            <div className="overflow-y-auto p-4 flex-1 bg-slate-50/50">
              {allMeetings.length === 0 ? (
                <div className="text-center py-10 text-slate-400 font-medium">생성된 모임이 없습니다.</div>
              ) : (
                <div className="grid gap-3">
                  {allMeetings.map(meeting => (
                    <a 
                      key={meeting.id} 
                      href={`/?id=${meeting.id}`}
                      className="bg-white border border-slate-200 p-4 rounded-2xl flex items-center justify-between hover:border-blue-300 hover:shadow-md transition-all group"
                    >
                      <div>
                        <h3 className="font-bold text-slate-800 group-hover:text-blue-600 transition-colors">{meeting.title || '새로운 모임'}</h3>
                        <p className="text-xs text-slate-400 font-mono mt-1">ID: {meeting.id}</p>
                      </div>
                      <div className="flex items-center gap-3">
                        <span className="text-[10px] text-slate-400 bg-slate-100 px-2 py-1 rounded-full">
                          {meeting.updatedAt ? new Date(meeting.updatedAt).toLocaleDateString() : '알 수 없음'}
                        </span>
                        <button 
                          onClick={(e) => deleteMeeting(meeting.id, e)} 
                          className="p-1.5 text-slate-300 hover:text-red-600 hover:bg-red-50 rounded-lg transition-all" 
                          title="이 모임 삭제하기"
                        >
                          <Trash2 size={16} />
                        </button>
                        <ExternalLink size={16} className="text-slate-300 group-hover:text-blue-500 transition-colors" />
                      </div>
                    </a>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default App;
