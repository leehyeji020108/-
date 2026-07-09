/**
 * Hard Carbon Electrochemical Analyzer - Core Application Logic
 * 작성자: 20년차 배터리 소재 전공 교수 관점의 분석 엔진
 */

// Global State
let rawBatteryData = [];
let headerColumns = [];
let mappedColumns = {
    cycle: -1,
    voltage: -1,
    capacity: -1,
    current: -1
};
let processedCycles = {}; // cycleNum -> { sodiation: [], desodiation: [], totalDischargeCap: 0, totalChargeCap: 0 }
let rateCapabilitySummary = []; // Array of C-rate summaries
let currentRateMode = 'charge'; // 'charge' or 'discharge' 용량 기준 모드
let selectedDqDvCycles = [1]; // dQ/dV 분석 탭용 선택된 다중 사이클 번호 배열
let selectedProfileCycles = [1]; // 전압 프로파일 탭용 선택된 다중 사이클 번호 배열
let isProfileCycleAll = true; // 개요 전압 프로파일 전체 사이클 선택 상태 기본 활성화 여부

// ============================================================
// 멀티 데이터셋 라이브러리 전역 상태
// ============================================================
let datasetLibrary = []; // 저장된 데이터셋 목록
let activeDatasetId = null; // 현재 단일 분석 중인 데이터셋 ID

// ============================================================
// 다중 파일 업로드용 큐 상태
// ============================================================
let _fileQueue = [];           // 업로드 대기 중인 File 객체 배열
let _parsedQueue = [];         // 파싱 완료된 { filename, processedCycles, rawData } 배열

// GITT 차단과 일반 파싱 실패를 구분하기 위한 센티넬 상수
const PARSE_BLOCKED_GITT = 'GITT_BLOCKED';

// 데이터셋 색상 팔레트 (최대 8개 데이터셋 지원)
const DATASET_COLORS = [
    '#60a5fa', // 파란색
    '#f472b6', // 핑크
    '#34d399', // 초록
    '#fbbf24', // 노랑
    '#a78bfa', // 보라
    '#fb923c', // 주황
    '#22d3ee', // 시안
    '#f87171', // 빨강
];

/**
 * Hex 색상 문자열을 투명도가 적용된 RGBA 문자열로 변환합니다.
 */
function hexToRgba(hex, alpha) {
    hex = hex.replace('#', '');
    let r = parseInt(hex.substring(0, 2), 16);
    let g = parseInt(hex.substring(2, 4), 16);
    let b = parseInt(hex.substring(4, 6), 16);
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

/**
 * HTML 특수문자를 이스케이프하여 XSS를 방지합니다.
 */
function escapeHtml(str) {
    if (typeof str !== 'string') return str;
    return str
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

/**
 * 현재 활성화되어 분석 중인 데이터셋이 존재하는지 확인합니다.
 */
function hasActiveDataset() {
    return activeDatasetId !== null && Object.keys(processedCycles).length > 0;
}

// Charts Instances
let chartProfileInstance = null;
let chartSlopePlateauInstance = null;
let chartRateCyclesInstance = null;
let chartRateSummaryInstance = null;
let chartDqDvInstance = null;

// DOM Elements
const dropZone = document.getElementById('dropZone');
const fileInput = document.getElementById('fileInput');
const welcomeView = document.getElementById('welcomeView');
const activeFilename = document.getElementById('activeFilename');
const targetDirectionProfile = document.getElementById('targetDirectionProfile');
const btnDownloadProfileExcel = document.getElementById('btnDownloadProfileExcel');

// Profile Multi-Cycle Controls
const profileCycleChipsContainer = document.getElementById('profileCycleChipsContainer');
const btnProfileCycleAll = document.getElementById('btnProfileCycleAll');
const btnProfileCycleClear = document.getElementById('btnProfileCycleClear');
const btnProfileCycleOdd = document.getElementById('btnProfileCycleOdd');
const btnProfileCycleEven = document.getElementById('btnProfileCycleEven');

// Analysis Inputs
const cutoffVoltageInput = document.getElementById('cutoffVoltage');
const cutoffValDisplay = document.getElementById('cutoffValDisplay');
const targetCycleSelect = document.getElementById('targetCycle');
const targetCycleSelectSP = document.getElementById('targetCycleSP');
const targetCycleDqDv = document.getElementById('targetCycleDqDv');
const selectDqDvMode = document.getElementById('selectDqDvMode');
const dqdvStepV = document.getElementById('dqdvStepV');
const dqdvStepVVal = document.getElementById('dqdvStepVVal');
const dqdvQo = document.getElementById('dqdvQo');
const dqdvMass = document.getElementById('dqdvMass');
const dqdvPostAvg = document.getElementById('dqdvPostAvg');
// Metric Displays

// GITT State & Charts (Stub & 가드용 상태 유지)
let isGittMode = false;

// 메인 모드 상태 및 DOM 엘리먼트 정의
let currentAnalysisMode = 'general'; // 'general' 고정
const rateConfigPanel = document.getElementById('rateConfigPanel');




// Export Buttons
const btnDownloadProfile = document.getElementById('btnDownloadProfile');
const btnDownloadSlopeChart = document.getElementById('btnDownloadSlopeChart');
const btnDownloadRateData = document.getElementById('btnDownloadRateData');
const btnDownloadRateDetailData = document.getElementById('btnDownloadRateDetailData');

// Tables
const tableRateSummary = document.getElementById('tableRateSummary');
const tableDqDvPeaks = document.getElementById('tableDqDvPeaks');

// Tab Selection
const tabButtons = document.querySelectorAll('.tab-btn');
const tabPanels = document.querySelectorAll('.tab-panel');

/* ==========================================
   1. Event Listeners & Initialization
   ========================================== */
document.addEventListener('DOMContentLoaded', async () => {
    initTabs();
    initFileUpload();
    initAnalysisControls();
    initExportFeatures();
    initRateToggle(); // C-rate 모드 전환 이벤트 초기화
    initDatasetLibrary(); // 데이터셋 라이브러리 이벤트 초기화
    // GITT 분석 버튼 클릭 시 gitt.html 새 탭으로 열기 리스너
    const btnGittComingSoon = document.getElementById('btnGittComingSoon');
    if (btnGittComingSoon) {
        btnGittComingSoon.addEventListener('click', (e) => {
            e.preventDefault();
            window.open('gitt.html', '_blank');
        });
    }

    // 최초 로드 시 기본 분석 모드 UI 정렬 수행 (탭 숨김, 사이드바 정렬 등)
    setAnalysisMode('general');

    // 데이터셋 초기 로드 완료 후 칩 UI 생성
    renderCycleChipsUI();

    // DB에서 기존 저장된 데이터셋 비동기 로드 및 복원
    try {
        const savedDS = await loadDatasetsFromDB();
        if (savedDS && savedDS.length > 0) {
            datasetLibrary = savedDS;
            renderDatasetLibraryUI();
            
            // 처음 웹사이트 진입 시에는 무조건 일반 분석 창만 띄우도록 제어합니다.
            // 일반 분석 데이터셋 중 가장 최신 것(가장 마지막에 추가된 것)을 찾아서 활성화합니다.
            const lastGeneralDs = [...datasetLibrary].reverse().find(ds => !ds.isGitt);
            if (lastGeneralDs) {
                switchActiveDataset(lastGeneralDs.id);
            } else {
                // 일반 분석 데이터셋이 아예 존재하지 않는 경우, 빈 일반 분석 창을 유지합니다.
                activeDatasetId = null;
                setAnalysisMode('general');
            }
            if (welcomeView) welcomeView.style.display = 'none';
        } else {
            // 저장된 기존 데이터가 없을 때는 웰컴 화면을 정상 노출하여 데모 시작이 가능하도록 함
            if (welcomeView) welcomeView.style.display = 'flex';
        }
    } catch (err) {
        console.error("초기 데이터셋 로드 오류:", err);
        if (welcomeView) welcomeView.style.display = 'flex';
    }
});

// Tab Switching Logic
function initTabs() {
    tabButtons.forEach(btn => {
        btn.addEventListener('click', () => {
            if (!hasActiveDataset()) return; // No data loaded

            // data-tab 속성이 없는 버튼(예: GITT 외부 창 버튼)은 탭 전환 처리를 건너뜁니다.
            const tabId = btn.getAttribute('data-tab');
            if (!tabId) return;

            const tabPanel = document.getElementById(tabId);
            if (!tabPanel) return; // 해당 패널이 DOM에 없으면 스킵

            tabButtons.forEach(b => b.classList.remove('active'));
            tabPanels.forEach(p => p.classList.remove('active'));
            
            btn.classList.add('active');
            tabPanel.classList.add('active');
            
            // Re-render chart on tab display to fix sizing issues
            setTimeout(() => {
                triggerChartResize();
                if (tabId === 'tab-dqdv') {
                    updateDqDvView();
                }
            }, 100);
        });
    });
}

function triggerChartResize() {
    if (chartProfileInstance) chartProfileInstance.resize();
    if (chartSlopePlateauInstance) chartSlopePlateauInstance.resize();
    if (chartRateCyclesInstance) chartRateCyclesInstance.resize();
    if (chartRateSummaryInstance) chartRateSummaryInstance.resize();
    if (chartDqDvInstance) chartDqDvInstance.resize();
}

// File Upload Drag & Drop & Input (다중 파일 지원)
function initFileUpload() {
    if (dropZone) {
        dropZone.addEventListener('dragover', (e) => {
            e.preventDefault();
            dropZone.classList.add('drag-active');
        });
        dropZone.addEventListener('dragleave', () => {
            dropZone.classList.remove('drag-active');
        });
        dropZone.addEventListener('drop', (e) => {
            e.preventDefault();
            dropZone.classList.remove('drag-active');
            const files = Array.from(e.dataTransfer.files).filter(f =>
                /\.(csv|txt|xlsx|xls)$/i.test(f.name)
            );
            if (files.length > 0) handleMultipleFiles(files);
        });
        dropZone.addEventListener('click', () => {
            if (fileInput) fileInput.click();
        });
    }
    if (fileInput) {
        fileInput.addEventListener('change', (e) => {
            const files = Array.from(e.target.files);
            if (files.length > 0) handleMultipleFiles(files);
            // 같은 파일 재선택 가능하도록 초기화
            fileInput.value = '';
        });
    }
}

/**
 * 여러 파일을 일괄 처리하는 진입점.
 * 모든 파일을 파싱한 후 이름 입력 모달을 한번에 띄웁니다.
 */
function handleMultipleFiles(files) {
    _fileQueue = [...files];
    _parsedQueue = [];
    activeFilename.textContent = `파일 ${files.length}개 처리 중...`;
    if (welcomeView) welcomeView.style.display = 'none';
    parseNextFileInQueue();
}

/**
 * 큐에서 다음 파일을 꺼내 파싱합니다. 모두 완료되면 이름 모달을 엽니다.
 */
function parseNextFileInQueue() {
    if (_fileQueue.length === 0) {
        // 모든 파일 파싱 완료 → 큐 파일명 초기화 후 이름 설정 모달 표시
        _currentQueueFile = '';
        if (_parsedQueue.length > 0) {
            showMultiFileNameModal();
        }
        return;
    }
    const file = _fileQueue.shift();
    const ext = file.name.split('.').pop().toLowerCase();
    // 파싱 완료 콜백을 받기 위해 전역 플래그 설정
    _currentQueueFile = file.name;
    if (ext === 'xlsx' || ext === 'xls') {
        parseExcelFileQueued(file);
    } else {
        readTextFileQueued(file);
    }
}

// 큐 파싱용 현재 파일명 임시 보관
let _currentQueueFile = '';

/**
 * 큐 파싱 완료 시 호출되는 콜백. processedCycles 스냅샷을 _parsedQueue에 저장합니다.
 */
function onQueueFileParsed(filename) {
    // processData() 호출 후 processedCycles가 채워진 상태에서 호출됨
    const savedCycles = JSON.parse(JSON.stringify(processedCycles));
    for (const cycleNum in savedCycles) {
        const cyc = savedCycles[cycleNum];
        if (cyc) { delete cyc.all; delete cyc.rawSodiation; delete cyc.rawDesodiation; }
    }
    _parsedQueue.push({ filename, processedCycles: savedCycles });
    // 다음 파일 처리
    parseNextFileInQueue();
}

// Reads raw file data (Supports XLSX / CSV / TXT)

// 엑셀 시트 내 데이터 필수 컬럼 존재 여부 체크
function checkHasHeaders(jsonData) {
    for (let i = 0; i < Math.min(20, jsonData.length); i++) {
        const row = jsonData[i];
        if (!row || !Array.isArray(row)) continue;
        
        let hasTime = false;
        let hasStep = false;
        let hasVoltage = false;
        let hasCapacity = false;
        
        row.forEach(cell => {
            if (cell !== undefined && cell !== null) {
                const lowerCell = String(cell).toLowerCase().trim();
                if (lowerCell.includes('time') && (lowerCell.includes('(s)') || lowerCell.includes('test'))) hasTime = true;
                if (lowerCell.includes('step') && lowerCell.includes('no')) hasStep = true;
                if (lowerCell.includes('voltage') || lowerCell.includes('potential') || lowerCell.includes('전압') || lowerCell === 'v') hasVoltage = true;
                if (lowerCell.includes('capacity') || lowerCell.includes('용량') || lowerCell.includes('cap') || lowerCell.includes('|q|')) hasCapacity = true;
            }
        });
        
        // GITT를 위한 조건 (시간, 스텝, 전압 필수)
        if (hasTime && hasStep && hasVoltage) {
            return true;
        }
        // 일반 충방전을 위한 조건 (전압, 용량 필수)
        if (hasVoltage && hasCapacity) {
            return true;
        }
    }
    return false;
}



// ---- 큐 파싱용 Excel 파서 (onQueueFileParsed 콜백 연결) ----
function parseExcelFileQueued(file) {
    const reader = new FileReader();
    reader.onload = (e) => {
        try {
            const data = e.target.result;
            const workbook = XLSX.read(data, { type: 'array' });
            const preferredSheets = workbook.SheetNames.filter(name => {
                const lower = name.toLowerCase();
                return lower.includes('data') || lower.includes('raw') || lower.includes('sheet1');
            });
            const searchOrder = [...preferredSheets, ...workbook.SheetNames.filter(n => !preferredSheets.includes(n))];
            let targetJsonData = null;
            for (const sheetName of searchOrder) {
                const ws = workbook.Sheets[sheetName];
                if (!ws) continue;
                const json = XLSX.utils.sheet_to_json(ws, { header: 1 });
                if (json && json.length >= 2 && checkHasHeaders(json)) {
                    targetJsonData = json; break;
                }
            }
            if (!targetJsonData) {
                targetJsonData = XLSX.utils.sheet_to_json(workbook.Sheets[workbook.SheetNames[0]], { header: 1 });
            }
            // 파싱 (processedCycles 채워짐)
            const parsedOk = parseExcelData(targetJsonData, file.name);
            if (parsedOk === false) {
                // GITT 파일 차단 등으로 실패한 경우 콜백 호출하지 않고 다음 큐 처리
                parseNextFileInQueue();
                return;
            }
            // 파싱 완료 후 큐 콜백 호출
            onQueueFileParsed(file.name);
        } catch (err) {
            console.error('큐 Excel 파싱 오류:', err);
            // 오류가 나도 다음 파일로 계속 진행
            parseNextFileInQueue();
        }
    };
    reader.readAsArrayBuffer(file);
}

// ---- 큐 파싱용 텍스트 파서 ----
function readTextFileQueued(file, encoding = 'UTF-8') {
    const reader = new FileReader();
    reader.onload = (e) => {
        const text = e.target.result;
        const result = parseRawText(text, file.name, encoding);
        // GITT 차단은 인코딩 실패와 구별하여 재시도하지 않음
        if (result === PARSE_BLOCKED_GITT) return;
        if (!result && encoding === 'UTF-8') {
            readTextFileQueued(file, 'EUC-KR');
            return;
        }
        if (result) {
            onQueueFileParsed(file.name);
        } else {
            console.warn('큐 텍스트 파싱 실패:', file.name);
            parseNextFileInQueue();
        }
    };
    reader.readAsText(file, encoding);
}

// Analysis UI control updates
function initAnalysisControls() {
    cutoffVoltageInput.addEventListener('input', (e) => {
        const val = parseFloat(e.target.value).toFixed(2);
        cutoffValDisplay.textContent = `${val} V`;
        if (hasActiveDataset()) {
            runAnalysis();
        }
    });

    targetCycleSelect.addEventListener('change', () => {
        if (hasActiveDataset()) {
            const val = targetCycleSelect.value;
            if (val === 'all') {
                isProfileCycleAll = true;
                selectedProfileCycles = [];
            } else {
                isProfileCycleAll = false;
                const cNum = parseInt(val);
                if (!isNaN(cNum)) {
                    selectedProfileCycles = [cNum];
                }
            }
            renderProfileCycleChipsUI();
            runAnalysis();
        }
    });

    if (targetDirectionProfile) {
        targetDirectionProfile.addEventListener('change', () => {
            if (hasActiveDataset()) {
                renderOverviewChart(null, false);
            }
        });
    }

    // 전압 프로파일 퀵 버튼 액션 바인딩
    initProfileCycleQuickActions();

    if (targetCycleSelectSP) {
        targetCycleSelectSP.addEventListener('change', () => {
            if (hasActiveDataset()) {
                runAnalysis();
            }
        });
    }

    if (targetCycleDqDv) {
        targetCycleDqDv.addEventListener('change', () => {
            const val = targetCycleDqDv.value;
            const cNum = parseInt(val);
            if (!isNaN(cNum) && !selectedDqDvCycles.includes(cNum)) {
                selectedDqDvCycles = [cNum];
                renderCycleChipsUI();
            }
            if (hasActiveDataset()) {
                updateDqDvView();
            }
        });
    }

    // 다중 사이클 퀵 필터 바인딩
    initCycleQuickActions();

    if (selectDqDvMode) {
        selectDqDvMode.addEventListener('change', () => {
            if (hasActiveDataset()) {
                updateDqDvView();
            }
        });
    }

    if (dqdvStepV) {
        dqdvStepV.addEventListener('input', (e) => {
            const val = parseFloat(e.target.value);
            if (dqdvStepVVal) {
                dqdvStepVVal.textContent = `${Math.round(val * 1000)} mV`;
            }
            if (hasActiveDataset()) {
                updateDqDvView();
            }
        });
    }

    if (dqdvQo) {
        dqdvQo.addEventListener('input', () => {
            if (hasActiveDataset()) {
                updateDqDvView();
            }
        });
    }

    if (dqdvMass) {
        dqdvMass.addEventListener('input', async () => {
            const val = parseFloat(dqdvMass.value);
            if (!isNaN(val) && val > 0 && activeDatasetId) {
                const ds = datasetLibrary.find(d => d.id === activeDatasetId);
                if (ds) {
                    ds.mass = val;
                    // 사이드바 UI의 질량 인풋값도 실시간 동기화하기 위해 라이브러리 UI 재렌더링
                    renderDatasetLibraryUI();
                    await updateDatasetInDB(ds);
                }
            }
            if (hasActiveDataset()) {
                updateDqDvView();
            }
        });
    }

    if (dqdvPostAvg) {
        dqdvPostAvg.addEventListener('input', () => {
            if (hasActiveDataset()) {
                updateDqDvView();
            }
        });
    }


    // C-rate 분석 단위 설정 변경 리스너
    const rateStepSizeSelect = document.getElementById('rateStepSize');
    if (rateStepSizeSelect) {
        rateStepSizeSelect.addEventListener('change', () => {
            if (hasActiveDataset()) {
                runAnalysis();
            }
        });
    }

    // 율속 단계 라벨 직접 입력 변경 리스너
    const rateStepsInput = document.getElementById('rateStepsInput');
    if (rateStepsInput) {
        rateStepsInput.addEventListener('change', () => {
            if (hasActiveDataset()) {
                runAnalysis();
            }
        });
    }

    // 측정 단위 토글 (C-rate / mA/g) 이벤트 바인딩
    const rateUnitToggle = document.getElementById('rateUnitToggle');
    if (rateUnitToggle) {
        rateUnitToggle.addEventListener('click', (e) => {
            const btn = e.target.closest('.rate-unit-btn');
            if (!btn) return;

            // 버튼 active 상태 전환
            rateUnitToggle.querySelectorAll('.rate-unit-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');

            // 입력 필드 플레이스홀더 및 라벨 업데이트
            const unit = btn.dataset.unit;
            const labelEl = document.getElementById('rateStepsLabel');
            const inputEl = document.getElementById('rateStepsInput');

            if (unit === 'mag') {
                if (labelEl) labelEl.textContent = '단계별 mA/g 값';
                if (inputEl) {
                    inputEl.placeholder = '예: 25, 50, 100, 200...';
                    // 기본값이 C-rate 형식이면 mA/g 기본값으로 교체 안내
                    if (inputEl.value.trim() === '0.1, 0.2, 0.5, 1, 2, 5, 10, 0.1') {
                        inputEl.value = '25, 50, 100, 200, 500, 1000, 2500, 25';
                    }
                }
            } else {
                if (labelEl) labelEl.textContent = '단계별 C-rate 값';
                if (inputEl) {
                    inputEl.placeholder = '예: 0.1, 0.2, 0.5, 1, 2...';
                    if (inputEl.value.trim() === '25, 50, 100, 200, 500, 1000, 2500, 25') {
                        inputEl.value = '0.1, 0.2, 0.5, 1, 2, 5, 10, 0.1';
                    }
                }
            }

            if (hasActiveDataset()) {
                runAnalysis();
            }
        });
    }
}

// C-rate 충방전 용량 모드 전환 초기화
function initRateToggle() {
    const selectRateMode = document.getElementById('selectRateMode');
    if (selectRateMode) {
        selectRateMode.addEventListener('change', (e) => {
            currentRateMode = e.target.value;
            updateRateCapabilityView();
        });
    }
}

// C-rate 탭 뷰 텍스트 및 그래프 모드 갱신
function updateRateCapabilityView() {
    const cycleTitle = document.getElementById('rateCyclesChartTitle');
    const selectRateMode = document.getElementById('selectRateMode');
    
    if (selectRateMode) {
        selectRateMode.value = currentRateMode;
    }
    
    if (currentRateMode === 'charge') {
        if (cycleTitle) cycleTitle.textContent = "사이클 경과에 따른 C-rate별 충전 용량";
    } else {
        if (cycleTitle) cycleTitle.textContent = "사이클 경과에 따른 C-rate별 방전 용량";
    }
    
    if (hasActiveDataset()) {
        calculateRateCapability();
        renderRateCapabilityCharts();
    }
}

// ============================================================
// IndexedDB 데이터 영속성 관리
// ============================================================
const DB_NAME = 'HCAnalyzerDB';
const DB_VERSION = 1;
const STORE_NAME = 'datasets';

function openDatabase() {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open(DB_NAME, DB_VERSION);
        
        request.onupgradeneeded = (e) => {
            const db = e.target.result;
            if (!db.objectStoreNames.contains(STORE_NAME)) {
                db.createObjectStore(STORE_NAME, { keyPath: 'id' });
            }
        };
        
        request.onsuccess = (e) => {
            resolve(e.target.result);
        };
        
        request.onerror = (e) => {
            console.error('IndexedDB open error:', e.target.error);
            reject(e.target.error);
        };
    });
}

async function saveDatasetToDB(dataset) {
    try {
        const db = await openDatabase();
        return new Promise((resolve, reject) => {
            const tx = db.transaction(STORE_NAME, 'readwrite');
            const store = tx.objectStore(STORE_NAME);
            const request = store.put(dataset);
            
            request.onsuccess = () => resolve(true);
            request.onerror = (e) => reject(e.target.error);
        });
    } catch (err) {
        console.error('DB Save failed:', err);
    }
}

async function deleteDatasetFromDB(id) {
    try {
        const db = await openDatabase();
        return new Promise((resolve, reject) => {
            const tx = db.transaction(STORE_NAME, 'readwrite');
            const store = tx.objectStore(STORE_NAME);
            const request = store.delete(id);
            
            request.onsuccess = () => resolve(true);
            request.onerror = (e) => reject(e.target.error);
        });
    } catch (err) {
        console.error('DB Delete failed:', err);
    }
}

async function updateDatasetInDB(dataset) {
    return saveDatasetToDB(dataset);
}

async function loadDatasetsFromDB() {
    try {
        const db = await openDatabase();
        return new Promise((resolve, reject) => {
            const tx = db.transaction(STORE_NAME, 'readonly');
            const store = tx.objectStore(STORE_NAME);
            const request = store.getAll();
            
            request.onsuccess = () => resolve(request.result || []);
            request.onerror = (e) => reject(e.target.error);
        });
    } catch (err) {
        console.error('DB Load failed:', err);
        return [];
    }
}

/* ============================================================
   데이터셋 라이브러리 관리 함수들
   ============================================================ */

/**
 * 데이터셋 라이브러리 이벤트 초기화 (모달 버튼 바인딩)
 */
function initDatasetLibrary() {
    const btnSave = document.getElementById('btnModalSave');
    const btnSkip = document.getElementById('btnModalSkip');
    const modal   = document.getElementById('datasetNameModal');

    if (btnSave) {
        // 저장하기: 각 입력란의 값을 읽어서 다중 저장
        btnSave.addEventListener('click', () => {
            finalizeMultiDatasetSave(false);
        });
    }
    if (btnSkip) {
        // 건너뛰기: 파일명을 그대로 이름으로 사용
        btnSkip.addEventListener('click', () => {
            finalizeMultiDatasetSave(true);
        });
    }
    // 모달 바깥 영역 클릭 시 건너뛰기
    if (modal) {
        modal.addEventListener('click', (e) => {
            if (e.target === modal) finalizeMultiDatasetSave(true);
        });
    }
}

/**
 * 다중 파일 이름 입력 모달을 표시합니다.
 * _parsedQueue 배열의 각 항목에 대해 이름 입력란을 생성합니다.
 */
function showMultiFileNameModal() {
    const modal = document.getElementById('datasetNameModal');
    const list  = document.getElementById('multiFileNameList');
    const titleEl = document.getElementById('modalTitle');
    const descEl  = document.getElementById('modalDesc');
    if (!modal || !list) return;

    const count = _parsedQueue.length;
    if (titleEl) titleEl.textContent = count > 1 ? `데이터셋 ${count}개 저장` : '데이터셋 저장';
    if (descEl) descEl.textContent = count > 1
        ? `${count}개 파일을 라이브러리에 저장합니다. 각 파일의 이름을 설정하세요.`
        : '업로드된 파일을 라이브러리에 저장합니다. 이름을 입력하세요.';

    list.innerHTML = '';
    _parsedQueue.forEach((item, idx) => {
        const defaultName = item.filename.replace(/\.[^.]+$/, '');
        const row = document.createElement('div');
        row.style.cssText = 'display:flex; flex-direction:column; gap:5px; background:rgba(255,255,255,0.03); border:1px solid rgba(255,255,255,0.08); border-radius:8px; padding:10px 12px;';
        
        const infoDiv = document.createElement('div');
        infoDiv.style.cssText = 'display:flex; align-items:center; gap:6px; font-size:10px; color:var(--text-muted);';
        
        const iconSpan = document.createElement('span');
        iconSpan.className = 'material-icons-round';
        iconSpan.style.fontSize = '13px';
        iconSpan.textContent = 'description';
        
        const nameSpan = document.createElement('span');
        nameSpan.textContent = item.filename;
        
        infoDiv.appendChild(iconSpan);
        infoDiv.appendChild(nameSpan);
        
        const inputEl = document.createElement('input');
        inputEl.type = 'text';
        inputEl.id = `multiNameInput_${idx}`;
        inputEl.className = 'modal-input';
        inputEl.value = defaultName;
        inputEl.placeholder = '데이터셋 이름 (예: HC-Glu-1500°C)';
        inputEl.style.margin = '0';
        
        row.appendChild(infoDiv);
        row.appendChild(inputEl);
        list.appendChild(row);
    });

    // 첫 번째 입력란에 포커스
    setTimeout(() => {
        const first = document.getElementById('multiNameInput_0');
        if (first) { first.select(); first.focus(); }
    }, 100);

    modal.style.display = 'flex';
}

/**
 * 모달에서 확정 버튼 클릭 시 _parsedQueue 전체를 라이브러리에 저장합니다.
 * @param {boolean} useFilenames - true면 입력값 무시하고 파일명 그대로 사용
 */
async function finalizeMultiDatasetSave(useFilenames) {
    const modal = document.getElementById('datasetNameModal');
    if (modal) modal.style.display = 'none';

    const savedAt = new Date().toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' });
    let lastDataset = null;

    for (let idx = 0; idx < _parsedQueue.length; idx++) {
        const item = _parsedQueue[idx];
        const inputEl = document.getElementById(`multiNameInput_${idx}`);
        const customName = useFilenames
            ? item.filename.replace(/\.[^.]+$/, '')
            : (inputEl ? inputEl.value.trim() : '') || item.filename.replace(/\.[^.]+$/, '');

        const colorIdx = datasetLibrary.length % DATASET_COLORS.length;
        const color = DATASET_COLORS[colorIdx];
        const id = (Date.now() + idx).toString();

        const savedCycles = item.processedCycles;
        const totalCycles = Object.keys(savedCycles).length;
        const firstCyc = savedCycles[1];
        const ice = firstCyc && firstCyc.totalDischargeCap > 0
            ? ((firstCyc.totalChargeCap / firstCyc.totalDischargeCap) * 100).toFixed(1)
            : '-';

        const dataset = {
            id,
            customName,
            filename: item.filename,
            uploadedAt: savedAt,
            processedCycles: savedCycles,
            totalCycles,
            ice,
            color,
            compareEnabled: true,
            selectedCycle: 1,
            mass: dqdvMass ? parseFloat(dqdvMass.value) || 2.58 : 2.58
        };

        datasetLibrary.push(dataset);
        lastDataset = dataset;

        try { await saveDatasetToDB(dataset); }
        catch (e) { console.warn('DB 저장 실패:', e); }
    }

    _parsedQueue = [];

    if (!lastDataset) return;

    // 마지막 파일을 활성 데이터셋으로 설정
    // (하지만 processedCycles는 마지막 파싱 결과가 메모리에 남아있으므로 switchActiveDataset 사용)
    activeDatasetId = lastDataset.id;
    processedCycles = JSON.parse(JSON.stringify(lastDataset.processedCycles));
    // TODO: hasActiveDataset() 도입으로 rawBatteryData = [1] 더미값 제거 준비됨
    rawBatteryData = [1]; // 분석 블로킹 방지 더미값
    activeFilename.textContent = lastDataset.customName;
    document.querySelector('.header-info .badge').textContent = 'LOADED';
    document.querySelector('.header-info .badge').className = 'badge badge-info';

    renderDatasetLibraryUI();

    // 사이클 셀렉터 재구성
    const cycleNumbers = Object.keys(processedCycles).map(Number).sort((a, b) => a - b);
    targetCycleSelect.innerHTML = '';
    if (targetCycleSelectSP) targetCycleSelectSP.innerHTML = '';
    if (targetCycleDqDv) targetCycleDqDv.innerHTML = '';
    const optAll = document.createElement('option');
    optAll.value = 'all'; optAll.textContent = '전체 사이클 (All)';
    targetCycleSelect.appendChild(optAll);
    cycleNumbers.forEach(cNum => {
        const o1 = document.createElement('option'); o1.value = cNum; o1.textContent = `${cNum} Cycle`;
        targetCycleSelect.appendChild(o1);
        if (targetCycleSelectSP) { const o2 = o1.cloneNode(true); targetCycleSelectSP.appendChild(o2); }
        if (targetCycleDqDv) { const o3 = o1.cloneNode(true); targetCycleDqDv.appendChild(o3); }
    });
    targetCycleSelect.value = 'all';
    if (targetCycleSelectSP) targetCycleSelectSP.value = cycleNumbers[0] || 1;
    if (targetCycleDqDv) targetCycleDqDv.value = cycleNumbers[0] || 1;
    if (cycleNumbers.length > 0) selectedDqDvCycles = [cycleNumbers[0]];
    isProfileCycleAll = true;
    selectedProfileCycles = [];
    renderCycleChipsUI();
    renderProfileCycleChipsUI();

    runAnalysis();
}

/**
 * 단일 파일 파싱 완료 후 모달 표시 (기존 호환성 유지용)
 * parseExcelData, parseRawText 에서 직접 호출됩니다.
 */
function showDatasetNameModal(filename) {
    // 단일 파일을 _parsedQueue에 넣고 다중 모달을 사용
    // (이미 processedCycles에 데이터가 채워진 상태)
    const savedCycles = JSON.parse(JSON.stringify(processedCycles));
    for (const cycleNum in savedCycles) {
        const cyc = savedCycles[cycleNum];
        if (cyc) { delete cyc.all; delete cyc.rawSodiation; delete cyc.rawDesodiation; }
    }
    _parsedQueue = [{ filename, processedCycles: savedCycles }];
    showMultiFileNameModal();
}

/**
 * 특정 데이터셋을 현재 단일 분석 대상으로 전환합니다.
 */
function switchActiveDataset(id) {
    const ds = datasetLibrary.find(d => d.id === id);
    if (!ds) return;

    activeDatasetId = id;

    // 1. 메모리 전역 상태 데이터 로드
    isGittMode = false;

    // 전역 processedCycles를 해당 데이터셋으로 교체
    processedCycles = JSON.parse(JSON.stringify(ds.processedCycles));
    // TODO: hasActiveDataset() 도입으로 rawBatteryData = [1] 더미값 제거 준비됨
    rawBatteryData = [1]; // 빈 배열이면 분석 블록됨, 더미 값으로 방어

    // 헤더 업데이트
    activeFilename.textContent = ds.customName;
    document.querySelector('.header-info .badge').textContent = "LOADED";
    document.querySelector('.header-info .badge').className = "badge badge-info";

    // 사이클 셀렉터 재구성
    const cycleNumbers = Object.keys(processedCycles).map(Number).sort((a, b) => a - b);
    targetCycleSelect.innerHTML = '';
    if (targetCycleSelectSP) targetCycleSelectSP.innerHTML = '';
    if (targetCycleDqDv) targetCycleDqDv.innerHTML = '';

    const optAll = document.createElement('option');
    optAll.value = 'all';
    optAll.textContent = '전체 사이클 (All)';
    targetCycleSelect.appendChild(optAll);

    cycleNumbers.forEach(cNum => {
        const o1 = document.createElement('option');
        o1.value = cNum; o1.textContent = `${cNum} Cycle`;
        targetCycleSelect.appendChild(o1);

        if (targetCycleSelectSP) {
            const o2 = document.createElement('option');
            o2.value = cNum; o2.textContent = `${cNum} Cycle`;
            targetCycleSelectSP.appendChild(o2);
        }

        if (targetCycleDqDv) {
            const o3 = document.createElement('option');
            o3.value = cNum; o3.textContent = `${cNum} Cycle`;
            targetCycleDqDv.appendChild(o3);
        }
    });

    targetCycleSelect.value = 'all';
    if (targetCycleSelectSP) targetCycleSelectSP.value = cycleNumbers[0] || 1;
    if (targetCycleDqDv) targetCycleDqDv.value = cycleNumbers[0] || 1;

    if (dqdvMass && ds.mass !== undefined) {
        dqdvMass.value = ds.mass;
    }

    // 활성 데이터셋 전환 시, 다중 사이클 선택 목록을 첫 사이클로 초기화
    if (cycleNumbers.length > 0) {
        selectedDqDvCycles = [cycleNumbers[0]];
    }
    isProfileCycleAll = true;
    selectedProfileCycles = [];
    renderCycleChipsUI();
    renderProfileCycleChipsUI();

    // 2. 현재 모드가 로드된 데이터셋 종류와 일치하지 않으면 UI 및 모드 갱신
    const targetMode = 'general';
    if (currentAnalysisMode !== targetMode) {
        setAnalysisMode(targetMode);
    } else {
        // 일반 분석 탭에 머물러 있으면 해당 탭 갱신, 만약 허용되지 않는 탭에 있었다면 개요로 강제 복원
        const activeTabBtn = document.querySelector('.tab-btn.active');
        const allowedTabs = ['tab-overview', 'tab-slope-plateau', 'tab-rate', 'tab-dqdv'];
        if (!activeTabBtn || !allowedTabs.includes(activeTabBtn.getAttribute('data-tab'))) {
            const fallbackBtn = document.querySelector('.tab-btn[data-tab="tab-overview"]');
            if (fallbackBtn) {
                tabButtons.forEach(b => b.classList.remove('active'));
                tabPanels.forEach(p => p.classList.remove('active'));
                fallbackBtn.classList.add('active');
                const fallbackPanel = document.getElementById('tab-overview');
                if (fallbackPanel) fallbackPanel.classList.add('active');
            }
        }
        runAnalysis();
    }
}

/**
 * 데이터셋을 라이브러리에서 삭제합니다.
 */
async function removeDataset(id) {
    datasetLibrary = datasetLibrary.filter(d => d.id !== id);

    // 삭제된 것이 현재 활성 데이터셋이면 마지막 것으로 전환
    if (activeDatasetId === id) {
        if (datasetLibrary.length > 0) {
            switchActiveDataset(datasetLibrary[datasetLibrary.length - 1].id);
        } else {
            activeDatasetId = null;
            processedCycles = {};
            rawBatteryData = [];
            isGittMode = false;
            
            const gittConfigPanel = document.getElementById('gittConfigPanel');
            if (gittConfigPanel) gittConfigPanel.style.display = 'none';
        }
    }

    renderDatasetLibraryUI();
    
    // DB에서 데이터셋 비동기 삭제
    await deleteDatasetFromDB(id);
    
    if (hasActiveDataset()) runAnalysis();
}

/**
 * 현재 비교 오버레이에 체크된 데이터셋 목록을 반환합니다.
 * 단일 데이터셋만 있으면 기존 단일 렌더링 모드와 동일하게 동작합니다.
 */
function getCheckedDatasets() {
    return datasetLibrary.filter(d => d.compareEnabled);
}

function renderDatasetLibraryUI() {
    const listEl = document.getElementById('datasetList');
    const countEl = document.getElementById('libraryCountBadge');
    
    if (!listEl) return;
    
    // 일반 분석 데이터셋만 필터링 (GITT 제외)
    const filteredLibrary = datasetLibrary.filter(ds => !ds.isGitt);
    
    if (countEl) {
        countEl.textContent = filteredLibrary.length;
    }
    
    // listEl 초기화
    listEl.innerHTML = '';
    
    if (filteredLibrary.length === 0) {
        const emptyMsg = document.createElement('div');
        emptyMsg.className = 'library-empty-msg';
        emptyMsg.textContent = '업로드된 일반 분석 데이터셋이 없습니다.';
        emptyMsg.style.padding = '15px';
        emptyMsg.style.textAlign = 'center';
        emptyMsg.style.color = 'rgba(255,255,255,0.4)';
        emptyMsg.style.fontSize = '12px';
        listEl.appendChild(emptyMsg);
        return;
    }
    
    filteredLibrary.forEach(ds => {
        const item = document.createElement('div');
        const isActive = (ds.id === activeDatasetId);
        item.className = `dataset-item${isActive ? ' is-active' : ''}`;
        
        // 1. Dataset Item Top (체크박스, 컬러닷, 이름, 이름수정버튼, 액티브배지, 삭제버튼)
        const topEl = document.createElement('div');
        topEl.className = 'dataset-item-top';
        
        const checkbox = document.createElement('input');
        checkbox.type = 'checkbox';
        checkbox.className = 'ds-compare-checkbox';
        checkbox.checked = !!ds.compareEnabled;
        checkbox.title = '비교 오버레이에 포함';
        
        const colorDot = document.createElement('span');
        colorDot.className = 'ds-color-dot';
        colorDot.style.backgroundColor = ds.color;
        colorDot.style.display = 'inline-block';
        colorDot.style.width = '10px';
        colorDot.style.height = '10px';
        colorDot.style.borderRadius = '50%';
        colorDot.style.marginRight = '6px';
        
        const nameSpan = document.createElement('span');
        nameSpan.className = 'ds-name';
        nameSpan.title = ds.customName;
        nameSpan.textContent = ds.customName;
        
        const renameBtn = document.createElement('button');
        renameBtn.className = 'ds-rename-btn';
        renameBtn.title = '이름 변경';
        renameBtn.textContent = '✏️';
        
        let activeBadge = null;
        if (isActive) {
            activeBadge = document.createElement('span');
            activeBadge.className = 'ds-active-badge';
            activeBadge.textContent = '분석중';
        }
        
        const deleteBtn = document.createElement('button');
        deleteBtn.className = 'ds-delete-btn';
        deleteBtn.title = '삭제';
        deleteBtn.textContent = '×';
        
        topEl.appendChild(checkbox);
        topEl.appendChild(colorDot);
        topEl.appendChild(nameSpan);
        topEl.appendChild(renameBtn);
        if (activeBadge) topEl.appendChild(activeBadge);
        topEl.appendChild(deleteBtn);
        
        // 2. Dataset Meta (파일명, 사이클수, ICE, 질량입력창)
        const metaEl = document.createElement('div');
        metaEl.className = 'ds-meta';
        metaEl.style.display = 'flex';
        metaEl.style.alignItems = 'center';
        metaEl.style.justifyContent = 'space-between';
        metaEl.style.flexWrap = 'wrap';
        metaEl.style.gap = '4px';
        metaEl.style.marginTop = '4px';
        
        const infoSpan = document.createElement('span');
        infoSpan.textContent = `${ds.filename} · ${ds.totalCycles} Cycles · ICE: ${ds.ice}%`;
        metaEl.appendChild(infoSpan);
        
        const massContainer = document.createElement('div');
        massContainer.className = 'ds-mass-container';
        massContainer.style.display = 'inline-flex';
        massContainer.style.alignItems = 'center';
        massContainer.style.gap = '2px';
        massContainer.style.fontSize = '10px';
        
        const massLabel = document.createElement('span');
        massLabel.textContent = 'Mass:';
        
        const massInput = document.createElement('input');
        massInput.type = 'number';
        massInput.className = 'ds-mass-input';
        massInput.dataset.dsId = ds.id;
        massInput.value = ds.mass !== undefined ? ds.mass : 2.58;
        massInput.step = '0.01';
        massInput.style.width = '48px';
        massInput.style.background = 'rgba(255,255,255,0.07)';
        massInput.style.border = '1px solid rgba(255,255,255,0.15)';
        massInput.style.color = '#fff';
        massInput.style.borderRadius = '3px';
        massInput.style.padding = '1px 3px';
        massInput.style.fontSize = '10px';
        massInput.style.textAlign = 'center';
        
        const massUnit = document.createElement('span');
        massUnit.textContent = 'mg';
        
        massContainer.appendChild(massLabel);
        massContainer.appendChild(massInput);
        massContainer.appendChild(massUnit);
        metaEl.appendChild(massContainer);
        
        item.appendChild(topEl);
        item.appendChild(metaEl);
        
        // 아이템 클릭 → 활성 데이터셋 전환 (체크박스·삭제·이름변경·질량입력은 제외)
        item.addEventListener('click', (e) => {
            if (e.target.closest('.ds-compare-checkbox') ||
                e.target.closest('.ds-delete-btn') ||
                e.target.closest('.ds-rename-btn') ||
                e.target.closest('.ds-rename-input') ||
                e.target.closest('.ds-mass-input')) return;
            switchActiveDataset(ds.id);
        });
        
        // 체크박스 → 비교 오버레이 토글
        checkbox.addEventListener('change', async (e) => {
            e.stopPropagation();
            ds.compareEnabled = e.target.checked;
            await updateDatasetInDB(ds);
            if (hasActiveDataset()) runAnalysis();
        });
        
        // 삭제 버튼
        deleteBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            removeDataset(ds.id);
        });
        
        // 이름 변경 버튼 (연필 아이콘)
        renameBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            const currentName = ds.customName;
            
            if (item.querySelector('.ds-rename-input')) return;
            
            const input = document.createElement('input');
            input.type = 'text';
            input.value = currentName;
            input.className = 'ds-rename-input';
            input.style.width = '100px';
            input.style.fontSize = '12px';
            input.style.background = 'rgba(255,255,255,0.15)';
            input.style.border = '1px solid rgba(255,255,255,0.3)';
            input.style.color = '#fff';
            input.style.borderRadius = '3px';
            input.style.padding = '2px';
            
            nameSpan.replaceWith(input);
            renameBtn.style.display = 'none';
            input.focus();
            input.select();
            
            const commitRename = async () => {
                const newName = input.value.trim();
                if (newName && newName !== currentName) {
                    ds.customName = newName;
                    if (ds.id === activeDatasetId) {
                        activeFilename.textContent = newName;
                    }
                    await updateDatasetInDB(ds);
                }
                renderDatasetLibraryUI();
            };
            
            const cancelRename = () => {
                renderDatasetLibraryUI();
            };
            
            input.addEventListener('keydown', (ev) => {
                ev.stopPropagation();
                if (ev.key === 'Enter') commitRename();
                else if (ev.key === 'Escape') cancelRename();
            });
            input.addEventListener('blur', commitRename);
            input.addEventListener('click', (ev) => ev.stopPropagation());
        });
        
        // 질량 입력 이벤트 리스너 추가
        massInput.addEventListener('click', (e) => e.stopPropagation());
        massInput.addEventListener('change', async (e) => {
            const newMass = parseFloat(e.target.value);
            if (!isNaN(newMass) && newMass > 0) {
                ds.mass = newMass;
                if (ds.id === activeDatasetId && dqdvMass) {
                    dqdvMass.value = newMass;
                }
                await updateDatasetInDB(ds);
                if (hasActiveDataset()) {
                    runAnalysis();
                    updateDqDvView();
                }
            }
        });
        
        listEl.appendChild(item);
    });
}



/* ==========================================
   2. Parser & Data Processing
   ========================================== */

/**
 * Parses raw Excel (JSON 2D Array) data, filters OCV, detects cycles and charge/discharge segments,
 * and normalizes the data to standard rawBatteryData format.
 */
/**
 * 엑셀 또는 텍스트 파일에서 파싱된 행 데이터를 정규화하고, 
 * 사이클 컬럼이 없거나 불명확한 경우 Rest 구간을 자동 감지하여 스킵하고 사이클을 쪼갭니다.
 */
function normalizeAndSplitCycles(dataRows, isAhUnit) {
    const rawData = [];

    // 1. Ah/g 단위를 mAh/g 단위로 변환
    dataRows.forEach(row => {
        if (isAhUnit) {
            row.capacity = row.capacity * 1000.0;
        }
    });

    // 2. 만약 파일 자체에 이미 유효한 사이클 정보가 존재하고 데이터에 퍼져 있다면, 해당 정보를 우선 사용
    // 단순 행 순번(인덱스) 열을 사이클 열로 오인하지 않도록 평균 한 사이클당 포인트 수(최소 20개)를 검증합니다.
    const uniqueCycles = new Set(dataRows.map(r => r.excelCycle).filter(c => c > 0));
    const avgPointsPerCycle = uniqueCycles.size > 0 ? (dataRows.length / uniqueCycles.size) : 0;
    const hasValidCycle = dataRows.some(r => r.excelCycle > 0) && 
                         uniqueCycles.size > 1 &&
                         avgPointsPerCycle >= 20;

    if (hasValidCycle) {
        console.log("기존 파일의 사이클 정보를 그대로 활용하여 로드합니다.");
        dataRows.forEach(row => {
            rawData.push([
                row.excelCycle > 0 ? row.excelCycle : 1,
                row.voltage,
                row.capacity,
                row.excelCurrent
            ]);
        });
        return rawData;
    }

    // 3. 사이클 정보가 없거나 불명확한 경우: 자동 사이클 및 Rest 감지 알고리즘 가동
    console.log("사이클 정보 미감지 -> 자동 사이클 분리 및 Rest 구간 필터링을 실행합니다.");

    // OCV/Rest 임계값: 0.05 mAh/g (0에 근접한 값)
    const REST_THRESHOLD = 0.05;

    // ACTIVE 영역을 찾기 위한 인덱스 그룹들 생성
    const segments = [];
    let currentSeg = [];

    for (let i = 0; i < dataRows.length; i++) {
        const row = dataRows[i];
        const c = row.capacity;

        if (c <= REST_THRESHOLD) {
            // REST 상태
            if (currentSeg.length > 0) {
                // 활성 구간 마감 시, REST 포인트를 끝에 붙이지 않고 마감합니다.
                // (끝에 붙이면 마지막 원소 용량이 0이 되어 용량 연산이 왜곡됩니다.)
                if (currentSeg.length >= 5) {
                    segments.push(currentSeg);
                }
                currentSeg = [];
            }
            continue;
        }

        // ACTIVE 상태 시작
        if (currentSeg.length === 0) {
            // 활성 구간 시작 시, 직전 REST 포인트(경계점, 용량 0인 시점)를 처음에 붙여주어 시작 전압 유실 방지
            if (i > 0) {
                currentSeg.push(dataRows[i - 1]);
            }
        }

        // 충방전 도중 급격한 용량 감소(단계 리셋 등)가 있는 경우 세그먼트 마감
        if (currentSeg.length > 0) {
            const prevRow = currentSeg[currentSeg.length - 1];
            // REST에서 땡겨온 직전 행이 아닌 진짜 활성 데이터끼리 비교하기 위해 인덱스 체크
            if (prevRow.capacity > REST_THRESHOLD && c < prevRow.capacity - 5.0) {
                if (currentSeg.length >= 5) {
                    segments.push(currentSeg);
                }
                // 새로운 세그먼트 시작 시 이전 마지막 포인트(경계점)를 앞에 붙임
                currentSeg = [prevRow, row];
                continue;
            }
        }

        currentSeg.push(row);
    }

    // 루프가 끝났을 때 마감되지 않은 세그먼트 처리
    if (currentSeg.length >= 5) {
        segments.push(currentSeg);
    }

    console.log(`자동 분리된 유효 충방전 세그먼트 개수: ${segments.length}`);

    // (C) 각 세그먼트별 순서에 따른 충/방전 판정 및 가상 사이클 번호 할당
    // 프로토콜 규칙: 방전 -> 충전 -> 방전 -> 충전이 순차적으로 반복됨
    let cycleCounter = 0;
    segments.forEach((seg, idx) => {
        // 홀수 번째 활성 세그먼트(idx = 0, 2, 4...)는 방전(Sodiation)
        // 짝수 번째 활성 세그먼트(idx = 1, 3, 5...)는 충전(Desodiation)
        const isSodiation = (idx % 2 === 0);

        if (isSodiation) {
            cycleCounter++; // 새로운 방전이 시작될 때마다 사이클 번호 증가
        }

        const virtualCurrent = isSodiation ? -1.0 : 1.0;

        seg.forEach(row => {
            rawData.push([
                cycleCounter,
                row.voltage,
                row.capacity,
                virtualCurrent
            ]);
        });
    });

    // 만약 세그먼트가 아예 없거나 너무 작아 검출되지 않은 경우, 전체 데이터를 1사이클로 폴백
    if (rawData.length === 0) {
        console.warn("충방전 세그먼트 자동 검출에 실패하여 전체 데이터를 1 사이클로 구성합니다.");
        dataRows.forEach(row => {
            rawData.push([
                1,
                row.voltage,
                row.capacity,
                row.excelCurrent || (row.voltage > 1.5 ? 1.0 : -1.0)
            ]);
        });
    }

    return rawData;
}

/**
 * Excel 데이터를 파싱하여 정규화 구조로 변환합니다.
 */
/**
 * 일반 분석 페이지(index.html)에서 GITT 파일이 업로드되는 것을 감지하고 차단합니다.
 * 사용자에게 gitt.html로 이동할지 물어본 후, 이동을 확인하면 gitt.html로 보내고,
 * 거절하면 업로드를 중단하고 업로드 대기열 큐를 비웁니다.
 */
function blockGittOnGeneralPage() {
    const confirmMove = confirm(
        "이 파일은 GITT 분석용 데이터로 감지되었습니다.\n" +
        "일반 분석 페이지에서는 GITT 데이터를 분석할 수 없습니다.\n" +
        "GITT 분석 페이지(gitt.html)로 이동하시겠습니까?"
    );
    if (confirmMove) {
        window.location.href = "gitt.html";
    }
    
    // 업로드 대기열 비우기 및 상태 초기화
    _fileQueue = [];
    _parsedQueue = [];
    _currentQueueFile = '';
    
    // 파일 입력 초기화
    const fileInput = document.getElementById('fileInput');
    if (fileInput) fileInput.value = '';
    
    // 드롭존 효과 해제
    const dropZone = document.getElementById('dropZone');
    if (dropZone) dropZone.classList.remove('drag-active');
    
    return true; // 차단됨
}

/**
 * Excel 데이터를 파싱하여 정규화 구조로 변환합니다.
 */
function parseExcelData(jsonData, filename) {
    if (!jsonData || jsonData.length < 2) {
        alert("엑셀 데이터가 올바르지 않거나 비어 있습니다.");
        return false;
    }

    // GITT 데이터 판정
    const isGittFile = filename.toLowerCase().includes('gitt') || 
                       jsonData.some(row => row && row.some(cell => typeof cell === 'string' && (cell.toLowerCase().includes('step no') || cell.toLowerCase().includes('test time'))));
    
    if (isGittFile) {
        blockGittOnGeneralPage();
        return false;
    }

    if (currentAnalysisMode !== 'general') {
        setAnalysisMode('general');
    }

    // 헤더 컬럼 자동 감지 (상위 20줄 내 검색)
    let headerRowIndex = 0;
    for (let i = 0; i < Math.min(20, jsonData.length); i++) {
        const row = jsonData[i];
        if (row && row.some(cell => typeof cell === 'string' && (cell.includes('전압') || cell.includes('용량') || cell.includes('voltage') || cell.includes('capacity') || cell.includes('v vs') || cell.includes('|용량_s|')))) {
            headerRowIndex = i;
            break;
        }
    }

    const headers = jsonData[headerRowIndex].map(h => String(h || '').trim());
    console.log("엑셀 헤더 감지됨:", headers);

    let voltColIdx = -1;
    let capColIdx = -1;
    let cycleColIdx = -1;
    let currColIdx = -1;
    let isAhUnit = false;

    headers.forEach((h, idx) => {
        const lowerH = h.toLowerCase();
        if (lowerH.includes('전압') || lowerH.includes('voltage') || lowerH.includes('v vs')) {
            voltColIdx = idx;
        } else if (lowerH.includes('용량') || lowerH.includes('capacity') || lowerH.includes('cap') || lowerH.includes('|용량_s|')) {
            capColIdx = idx;
            if (lowerH.includes('ah/g') && !lowerH.includes('mah/g')) {
                isAhUnit = true;
            }
        } else if (lowerH.includes('사이클') || lowerH.includes('cycle')) {
            cycleColIdx = idx;
        } else if (lowerH.includes('전류') || lowerH.includes('current')) {
            currColIdx = idx;
        }
    });

    if (voltColIdx === -1 || capColIdx === -1) {
        alert("엑셀 시트에서 '전압' 및 '용량' 컬럼을 찾을 수 없습니다. 헤더 이름을 확인해 주십시오.");
        return false;
    }

    const dataRows = [];
    for (let i = headerRowIndex + 1; i < jsonData.length; i++) {
        const row = jsonData[i];
        if (!row || row.length === 0) continue;

        const voltVal = parseFloat(row[voltColIdx]);
        const capVal = parseFloat(row[capColIdx]);

        if (isNaN(voltVal) || isNaN(capVal)) continue;

        const cycleVal = cycleColIdx !== -1 ? Math.round(parseFloat(row[cycleColIdx])) : -1;
        const currVal = currColIdx !== -1 ? parseFloat(row[currColIdx]) : 0;

        dataRows.push({
            voltage: voltVal,
            capacity: capVal,
            excelCycle: cycleVal,
            excelCurrent: currVal,
            rawIndex: i
        });
    }

    if (dataRows.length === 0) {
        alert("유효한 데이터 행이 존재하지 않습니다.");
        return false;
    }

    // 공통 함수를 사용한 정규화 및 사이클 자동 검출
    const parsedData = normalizeAndSplitCycles(dataRows, isAhUnit);
    
    // 루프 돌기 전 이미 다운샘플링하여 적재했으므로 메모리 카피만 수행
    rawBatteryData = parsedData;

    headerColumns = ["Cycle", "Voltage(V)", "Capacity(mAh/g)", "Current(mA)"];
    mappedColumns = {
        cycle: 0,
        voltage: 1,
        capacity: 2,
        current: 3
    };

    activeFilename.textContent = filename;
    document.querySelector('.header-info .badge').textContent = "LOADED";
    document.querySelector('.header-info .badge').className = "badge badge-info";



    processData(); // processedCycles 배열 구성
    // 큐 파싱 중이면 모달 호출을 건너뜁니다 (onQueueFileParsed에서 일괄 처리)
    if (!_currentQueueFile) {
        showDatasetNameModal(filename);
    }
    return true;
}

/**
 * 텍스트 데이터(CSV, TSV, TXT 등)를 파싱하여 정규화 구조로 변환합니다.
 */
function parseRawText(text, filename, encoding = 'UTF-8') {
    const isGittText = filename.toLowerCase().includes('gitt') || text.toLowerCase().includes('step no') || text.toLowerCase().includes('test time');
    if (isGittText) {
        blockGittOnGeneralPage();
        return PARSE_BLOCKED_GITT; // 일반 파싱 실패(false)와 명확히 구분
    }

    if (currentAnalysisMode !== 'general') {
        setAnalysisMode('general');
    }

    activeFilename.textContent = filename;
    document.querySelector('.header-info .badge').textContent = "LOADED";
    document.querySelector('.header-info .badge').className = "badge badge-info";

    const lines = text.split(/\r?\n/);
    if (lines.length < 2) return false;

    // 헤더 행 위치 자동 감색 (상위 30줄 검색하여 키워드 매칭)
    let headerIndex = -1;
    for (let i = 0; i < Math.min(30, lines.length); i++) {
        const line = lines[i].trim();
        if (line === '') continue;
        const lowerLine = line.toLowerCase();
        if (lowerLine.includes('전압') || lowerLine.includes('voltage') || lowerLine.includes('v vs') || 
            lowerLine.includes('capacity') || lowerLine.includes('용량') || lowerLine.includes('cap') || 
            lowerLine.includes('|용량_s|') || lowerLine.includes('인덱스')) {
            headerIndex = i;
            break;
        }
    }
    if (headerIndex === -1) {
        headerIndex = 0;
        while (headerIndex < lines.length && lines[headerIndex].trim() === '') {
            headerIndex++;
        }
    }

    const headerLine = lines[headerIndex];
    let delimiter = ',';
    if (headerLine.includes('\t')) {
        delimiter = '\t';
    } else if (headerLine.includes(';')) {
        delimiter = ';';
    } else if (headerLine.includes(',')) {
        delimiter = ',';
    } else {
        delimiter = /\s+/; // 연속된 공백 구분자 지원
    }

    const headers = headerLine.split(delimiter).map(h => h.replace(/"/g, '').trim()).filter(h => h !== '');
    console.log(`텍스트 헤더 감지됨 (${encoding}):`, headers);

    let voltColIdx = -1;
    let capColIdx = -1;
    let cycleColIdx = -1;
    let currColIdx = -1;
    let isAhUnit = false;

    headers.forEach((h, idx) => {
        const lowerH = h.toLowerCase().trim();
        if (lowerH.includes('전압') || lowerH.includes('voltage') || lowerH.includes('v vs') || lowerH.includes('potential') || lowerH.includes('volt') || lowerH.includes('전압(v)')) {
            voltColIdx = idx;
        } else if (lowerH.includes('용량') || lowerH.includes('capacity') || lowerH.includes('cap') || lowerH.includes('|용량_s|') || lowerH.includes('ah/g') || lowerH.includes('비용량')) {
            capColIdx = idx;
            if (lowerH.includes('ah/g') && !lowerH.includes('mah/g')) {
                isAhUnit = true;
            }
        } else if (lowerH.includes('사이클') || lowerH.includes('cycle') || lowerH.includes('인덱스') || lowerH.includes('index') || lowerH.includes('step')) {
            cycleColIdx = idx;
        } else if (lowerH.includes('전류') || lowerH.includes('current') || lowerH.includes('curr') || lowerH.includes('i (')) {
            currColIdx = idx;
        }
    });

    // 전압 또는 용량 컬럼을 찾지 못한 경우 (한글 깨짐 등의 사유일 수 있음)
    if (voltColIdx === -1 || capColIdx === -1) {
        console.warn(`컬럼 감지 실패 -> 전압: ${voltColIdx}, 용량: ${capColIdx} (${encoding})`);
        return false;
    }

    const dataRows = [];
    for (let i = headerIndex + 1; i < lines.length; i++) {
        const line = lines[i].trim();
        if (line === '') continue;

        const parts = line.split(delimiter).map(p => parseFloat(p.trim()));
        if (parts.length <= Math.max(voltColIdx, capColIdx)) continue;

        const voltVal = parts[voltColIdx];
        const capVal = parts[capColIdx];
        if (isNaN(voltVal) || isNaN(capVal)) continue;

        const cycleVal = cycleColIdx !== -1 ? Math.round(parts[cycleColIdx]) : -1;
        const currVal = currColIdx !== -1 ? parts[currColIdx] : 0;

        dataRows.push({
            voltage: voltVal,
            capacity: capVal,
            excelCycle: cycleVal,
            excelCurrent: currVal,
            rawIndex: i
        });
    }

    if (dataRows.length === 0) {
        return false;
    }

    // 공통 함수를 사용한 정규화 및 사이클 자동 검출
    const parsedData = normalizeAndSplitCycles(dataRows, isAhUnit);
    
    // 루프 돌기 전 이미 다운샘플링하여 적재했으므로 메모리 카피만 수행
    rawBatteryData = parsedData;

    headerColumns = ["Cycle", "Voltage(V)", "Capacity(mAh/g)", "Current(mA)"];
    mappedColumns = {
        cycle: 0,
        voltage: 1,
        capacity: 2,
        current: 3
    };



    processData(); // processedCycles 배열 구성
    // 큐 파싱 중이면 모달 호출을 건너뜁니다 (onQueueFileParsed에서 일괄 처리)
    if (!_currentQueueFile) {
        showDatasetNameModal(filename);
    }
    return true;
}





/**
 * Organizes raw data points into cycles and splits them into Charge (Desodiation) / Discharge (Sodiation)
 */
function processData() {
    processedCycles = {};
    
    const cycleIdx = mappedColumns.cycle;
    const voltIdx = mappedColumns.voltage;
    const capIdx = mappedColumns.capacity;
    const currIdx = mappedColumns.current;

    rawBatteryData.forEach(row => {
        const cycleNum = Math.round(row[cycleIdx]);
        const voltage = row[voltIdx];
        const capacity = row[capIdx];
        const current = row[currIdx];

        if (!processedCycles[cycleNum]) {
            processedCycles[cycleNum] = {
                all: [],
                sodiation: [],  // Discharge (Voltage going down, Na insertion)
                desodiation: [], // Charge (Voltage going up, Na extraction)
                rawSodiation: [],
                rawDesodiation: []
            };
        }
        
        processedCycles[cycleNum].all.push({ voltage, capacity, current });
    });

    // Splitting Logic based on actual current direction (derived from capacity 0 rest states)
    for (const [cycleNum, cycleData] of Object.entries(processedCycles)) {
        const points = cycleData.all;
        if (points.length < 2) continue;

        // current < 0 이면 Sodiation(방전), current > 0 이면 Desodiation(충전)으로 분류
        const rawSod = points.filter(p => p.current < 0);
        const rawDesod = points.filter(p => p.current > 0);

        // 방전/충전 각 구간의 capacity를 0에서 시작하도록 정규화합니다.
        // (장비에 따라 방전 시작 시 capacity가 0이 아닌 값일 수 있으므로 시작점을 빼줍니다)
        if (rawSod.length > 0) {
            const sodStartCap = rawSod[0].capacity;
            cycleData.sodiation = rawSod.map((p) => ({
                voltage: p.voltage,
                capacity: p.capacity - sodStartCap, // 0부터 시작하도록 정규화
                current: p.current
            }));
            // 마지막 포인트의 정규화된 capacity = 실제 방전 용량
            cycleData.totalDischargeCap = cycleData.sodiation[cycleData.sodiation.length - 1].capacity;
        }

        if (rawDesod.length > 0) {
            const desodStartCap = rawDesod[0].capacity;
            cycleData.desodiation = rawDesod.map((p) => ({
                voltage: p.voltage,
                capacity: p.capacity - desodStartCap, // 0부터 시작하도록 정규화
                current: p.current
            }));
            // 마지막 포인트의 정규화된 capacity = 실제 충전 용량
            cycleData.totalChargeCap = cycleData.desodiation[cycleData.desodiation.length - 1].capacity;
        }
    }

    // Populate Target Cycle selectors
    const currentSelected = targetCycleSelect.value;
    
    targetCycleSelect.innerHTML = '';
    if (targetCycleSelectSP) targetCycleSelectSP.innerHTML = '';
    if (targetCycleDqDv) targetCycleDqDv.innerHTML = '';
    
    const cycleNumbers = Object.keys(processedCycles).map(Number).sort((a, b) => a - b);
    
    const fragment1 = document.createDocumentFragment();
    const fragment2 = document.createDocumentFragment();
    const fragment3 = document.createDocumentFragment();
    
    // 개요 및 ICE 탭용 전체 사이클 선택지 추가
    const optAll = document.createElement('option');
    optAll.value = 'all';
    optAll.textContent = '전체 사이클 (All)';
    fragment1.appendChild(optAll);
    
    cycleNumbers.forEach(cycleNum => {
        // 개요 및 ICE 탭용
        const opt1 = document.createElement('option');
        opt1.value = cycleNum;
        opt1.textContent = `${cycleNum} Cycle`;
        fragment1.appendChild(opt1);
        
        // Slope / Plateau 탭용
        if (targetCycleSelectSP) {
            const opt2 = document.createElement('option');
            opt2.value = cycleNum;
            opt2.textContent = `${cycleNum} Cycle`;
            fragment2.appendChild(opt2);
        }

        // dQ/dV 탭용
        if (targetCycleDqDv) {
            const opt3 = document.createElement('option');
            opt3.value = cycleNum;
            opt3.textContent = `${cycleNum} Cycle`;
            fragment3.appendChild(opt3);
        }
    });
    
    targetCycleSelect.appendChild(fragment1);
    if (targetCycleSelectSP) targetCycleSelectSP.appendChild(fragment2);
    if (targetCycleDqDv) targetCycleDqDv.appendChild(fragment3);

    const finalSelected = (currentSelected === 'all' || cycleNumbers.includes(parseInt(currentSelected))) ? currentSelected : 'all';
    targetCycleSelect.value = finalSelected;
    if (targetCycleSelectSP) {
        targetCycleSelectSP.value = (currentSelected === 'all' || !cycleNumbers.includes(parseInt(currentSelected))) ? (cycleNumbers[0] || '1') : currentSelected;
    }
    if (targetCycleDqDv) {
        const prevVal = targetCycleDqDv.value;
        const prevCyc = parseInt(prevVal);
        if (prevCyc > 0 && cycleNumbers.includes(prevCyc)) {
            targetCycleDqDv.value = prevVal;
            if (!selectedDqDvCycles.includes(prevCyc)) {
                selectedDqDvCycles = [prevCyc];
            }
        } else {
            const dVal = (currentSelected === 'all' || !cycleNumbers.includes(parseInt(currentSelected))) ? (cycleNumbers[0] || '1').toString() : currentSelected;
            targetCycleDqDv.value = dVal;
            const cNum = parseInt(dVal);
            if (!isNaN(cNum)) {
                selectedDqDvCycles = [cNum];
            }
        }
        renderCycleChipsUI();
    }
    renderProfileCycleChipsUI();
}

/* ==========================================
   3. Electrochemical Analysis Calculations
   ========================================== */
function runAnalysis() {
    // 항상 targetCycleSP 기준의 cycleData를 획득하여 Slope/Plateau 차트에 전달
    const spCycleNum = parseInt(targetCycleSP.value) || 1;
    const spCycleData = processedCycles[spCycleNum];
    
    // 대표 수치 갱신용 사이클 번호 산출
    let displayCNum = 1;
    const cycleNumbers = Object.keys(processedCycles).map(Number).sort((a, b) => a - b);
    if (isProfileCycleAll) {
        displayCNum = cycleNumbers[cycleNumbers.length - 1] || 1;
    } else if (selectedProfileCycles.length > 0) {
        displayCNum = selectedProfileCycles[selectedProfileCycles.length - 1];
    } else {
        displayCNum = cycleNumbers[0] || 1;
    }

    const cycleData = processedCycles[displayCNum];
    if (cycleData) {
        updateAnalysisNumbers(cycleData, displayCNum);
    }

    // 전압 프로파일 차트 렌더링 (인자는 더 이상 직접 타지 않고 전역 변수에서 처리됨)
    renderOverviewChart(null, false);

    // Slope/Plateau 차트 렌더링
    if (spCycleData) {
        renderSlopePlateauChart(spCycleData, parseFloat(cutoffVoltageInput.value));
    }
    
    calculateRateCapability();
    renderRateCapabilityCharts();
    updateDqDvView();
}

/**
 * 선택된(체크박스 체크된) 모든 데이터셋의 초기 탈소듐/소듐화 용량 및 가역 효율(ICE) 수치를
 * 하단 테이블에 정량적으로 비교 렌더링합니다.
 */
function updateOverviewMetricsTable() {
    const tbody = document.querySelector('#tableOverviewMetrics tbody');
    if (!tbody) return;

    const checkedDS = getCheckedDatasets();
    // 체크된 것이 없으면 현재 활성 데이터셋만이라도 표에 노출
    const displayDS = checkedDS.length > 0 ? checkedDS : datasetLibrary.filter(d => d.id === activeDatasetId);

    if (displayDS.length === 0) {
        tbody.innerHTML = `<tr><td colspan="5" style="text-align: center; color: var(--text-muted);">로드된 데이터가 없습니다.</td></tr>`;
        return;
    }

    let html = "";
    displayDS.forEach(ds => {
        if (!ds || !ds.processedCycles) return; // 안전장치: GITT 데이터셋 등 CC/CV가 아닌 것은 스킵
        // 각 데이터셋의 1번 사이클 또는 최초의 사이클 데이터 획득
        const firstCycle = ds.processedCycles[1] || Object.values(ds.processedCycles)[0];
        if (!firstCycle) return;

        const initDischarge = firstCycle.totalDischargeCap || 0;
        const initCharge = firstCycle.totalChargeCap || 0;
        const ice = initDischarge > 0 ? (initCharge / initDischarge) * 100 : 0;

        let iceDesc = "";
        let iceColor = "";
        if (ice >= 85) {
            iceDesc = "우수한 초기 효율 (Top-tier SIB 수준)";
            iceColor = "var(--color-success)";
        } else if (ice >= 75) {
            iceDesc = "보통 효율 (SEI 제어 보완 필요)";
            iceColor = "var(--color-orange)";
        } else {
            iceDesc = "낮은 효율 (SEI 손실 발생 의심)";
            iceColor = "var(--color-danger)";
        }

        const safeName = escapeHtml(ds.customName);

        html += `
            <tr>
                <td>
                    <span class="ds-color-dot" style="background:${ds.color}; display:inline-block; width:8px; height:8px; border-radius:50%; margin-right:6px; vertical-align:middle; box-shadow:0 0 6px ${ds.color};"></span>
                    <strong style="vertical-align:middle; color:#fff;">${safeName}</strong>
                </td>
                <td style="font-weight: 500;">${initDischarge.toFixed(1)} mAh/g</td>
                <td style="font-weight: 500;">${initCharge.toFixed(1)} mAh/g</td>
                <td><span style="color:${iceColor}; font-weight:700;">${ice.toFixed(1)}%</span></td>
                <td style="font-size:11px; color:var(--text-muted); font-style:italic;">${iceDesc}</td>
            </tr>
        `;
    });

    tbody.innerHTML = html;
}

/**
 * 선택된(체크박스 체크된) 모든 데이터셋의 Slope 및 Plateau 가역 용량, 분율을
 * 하단 통합 테이블에 정량적으로 비교 렌더링하고 디스커션 가이드를 제공합니다.
 */
function updateSlopePlateauMetricsTable() {
    const tbody = document.querySelector('#tableSlopePlateauMetrics tbody');
    if (!tbody) return;

    const checkedDS = getCheckedDatasets();
    // 체크된 것이 없으면 현재 활성 데이터셋만이라도 표에 노출
    const displayDS = checkedDS.length > 0 ? checkedDS : datasetLibrary.filter(d => d.id === activeDatasetId);

    if (displayDS.length === 0) {
        tbody.innerHTML = `<tr><td colspan="8" style="text-align: center; color: var(--text-muted);">로드된 데이터가 없습니다.</td></tr>`;
        return;
    }

    const cutoffV = parseFloat(cutoffVoltageInput.value);
    const targetCycleNum = parseInt(targetCycleSP.value) || 1;

    let html = "";
    displayDS.forEach(ds => {
        if (!ds || !ds.processedCycles) return; // 안전장치: GITT 데이터셋 등 CC/CV가 아닌 것은 스킵
        const dsCycles = Object.keys(ds.processedCycles).map(Number).sort((a, b) => a - b);
        if (dsCycles.length === 0) return;

        // 선택된 분석 사이클이 없으면 가장 가까운 사이클 번호로 폴백
        let cNum = targetCycleNum;
        if (!dsCycles.includes(cNum)) {
            cNum = dsCycles.reduce((prev, curr) => Math.abs(curr - targetCycleNum) < Math.abs(prev - targetCycleNum) ? curr : prev);
        }

        const cycleData = ds.processedCycles[cNum];
        if (!cycleData) return;

        const sodPoints = cycleData.sodiation || [];
        let slopeCapacity = 0;
        let plateauCapacity = 0;
        
        if (sodPoints.length > 0) {
            let cutoffIndex = sodPoints.findIndex(p => p.voltage <= cutoffV);
            if (cutoffIndex === -1) {
                slopeCapacity = cycleData.totalDischargeCap || 0;
                plateauCapacity = 0;
            } else {
                slopeCapacity = sodPoints[cutoffIndex].capacity;
                plateauCapacity = (cycleData.totalDischargeCap || 0) - slopeCapacity;
            }
        }

        const totalCap = slopeCapacity + plateauCapacity;
        const slopeRatio = totalCap > 0 ? (slopeCapacity / totalCap) * 100 : 0;
        const plateauRatio = totalCap > 0 ? (plateauCapacity / totalCap) * 100 : 0;

        // 학술적 교수 디스커션 가이드 요약 생성
        let comment = "";
        if (plateauRatio > 55) {
            comment = `<strong>Plateau 우세형 (${plateauRatio.toFixed(1)}%)</strong>: 나노기공 내 Na 클러스터링 거동 지배적. 저전압 고밀도 에너지 밀도용 탄소입니다.`;
        } else if (slopeRatio > 55) {
            comment = `<strong>Slope 우세형 (${slopeRatio.toFixed(1)}%)</strong>: 표면 흡착 및 무질서 층간 거동 지배적. 고출력/속속성(High-rate) 소재에 유리합니다.`;
        } else {
            comment = `<strong>하이브리드형 (${slopeRatio.toFixed(0)}:${plateauRatio.toFixed(0)})</strong>: 삽입과 기공 적층 저장 메커니즘이 고르게 발달한 탄소 거동을 지시합니다.`;
        }

        const safeName = escapeHtml(ds.customName);

        html += `
            <tr>
                <td>
                    <span class="ds-color-dot" style="background:${ds.color}; display:inline-block; width:8px; height:8px; border-radius:50%; margin-right:6px; vertical-align:middle; box-shadow:0 0 6px ${ds.color};"></span>
                    <strong style="vertical-align:middle; color:#fff;">${safeName}</strong>
                </td>
                <td>Cycle ${cNum}</td>
                <td style="font-weight: 500; color: var(--color-slope);">${slopeCapacity.toFixed(1)} mAh/g</td>
                <td>${slopeRatio.toFixed(1)}%</td>
                <td style="font-weight: 500; color: var(--color-plateau);">${plateauCapacity.toFixed(1)} mAh/g</td>
                <td>${plateauRatio.toFixed(1)}%</td>
                <td style="font-weight: 600; color: var(--color-success);">${totalCap.toFixed(1)} mAh/g</td>
                <td style="font-size:11px; color:var(--text-main); line-height:1.4;">${comment}</td>
            </tr>
        `;
    });

    tbody.innerHTML = html;
}

// 개별 수치 카드 및 분석 요약 테이블 텍스트 갱신 함수
function updateAnalysisNumbers(cycleData, targetCycleNum) {
    // 3.1. ICE and Capacity Overview Table Update
    updateOverviewMetricsTable();
    
    // 3.2. Slope vs Plateau Capacity Summary Table Update
    updateSlopePlateauMetricsTable();
}

/**
 * C-rate / mA/g 율속 분석 함수
 * 사이드바의 사용자 입력값(단계 라벨, 단계당 사이클 수, 단위)을 읽어 동적으로 라벨 생성
 */
function calculateRateCapability() {
    rateCapabilitySummary = [];
    const cycles = Object.keys(processedCycles).map(Number).sort((a, b) => a - b);
    
    // 1. 기존의 rateCapabilitySummary 배열 빌드 (차트 및 CSV 내보내기 호환용)
    if (cycles.length >= 2) {
        let stepSize = 5;
        const rateStepSizeSelect = document.getElementById('rateStepSize');
        if (rateStepSizeSelect) {
            stepSize = parseInt(rateStepSizeSelect.value) || 5;
        }

        // 현재 선택된 측정 단위 확인 (C-rate / mA/g)
        const activeUnitBtn = document.querySelector('.rate-unit-btn.active');
        const currentUnit = activeUnitBtn ? activeUnitBtn.dataset.unit : 'crate';
        const unitSuffix = currentUnit === 'mag' ? ' mA/g' : ' C';

        // 사용자가 입력한 단계 값 파싱 (숫자만 추출, 쉼표 구분)
        const rateStepsInput = document.getElementById('rateStepsInput');
        let userStepValues = [];
        if (rateStepsInput && rateStepsInput.value.trim() !== '') {
            userStepValues = rateStepsInput.value
                .split(',')
                .map(s => s.trim())
                .filter(s => s !== '' && !isNaN(parseFloat(s)));
        }

        // 단계 인덱스 -> 라벨 변환 함수
        function getStepLabel(stepIndex) {
            if (userStepValues.length > 0 && stepIndex < userStepValues.length) {
                const val = parseFloat(userStepValues[stepIndex]);
                return `${val}${unitSuffix}`;
            }
            return `Step ${stepIndex + 1}`;
        }

        let baseCap = 0;
        let stepIndex = 0;

        for (let i = 0; i < cycles.length; i += stepSize) {
            const stepCycles = cycles.slice(i, i + stepSize);
            if (stepCycles.length === 0) break;

            let sumCap = 0;
            let sumCE = 0;
            let validCount = 0;

            stepCycles.forEach(cNum => {
                const cyc = processedCycles[cNum];
                const capVal = currentRateMode === 'charge'
                    ? (cyc ? cyc.totalChargeCap : 0)
                    : (cyc ? cyc.totalDischargeCap : 0);
                if (cyc && capVal > 0) {
                    sumCap += capVal;
                    const ce = (cyc.totalDischargeCap > 0)
                        ? (cyc.totalChargeCap / cyc.totalDischargeCap) * 100
                        : 0;
                    sumCE += ce;
                    validCount++;
                }
            });

            if (validCount === 0) { stepIndex++; continue; }

            const avgCap = sumCap / validCount;
            const avgCE = sumCE / validCount;
            const rateName = getStepLabel(stepIndex);

            if (stepIndex === 0) {
                baseCap = avgCap; // 첫 번째 단계를 기준 용량으로 설정
            }

            const retention = baseCap > 0 ? (avgCap / baseCap) * 100 : 0;

            rateCapabilitySummary.push({
                rate: rateName,
                cycleRange: `${stepCycles[0]} - ${stepCycles[stepCycles.length - 1]}`,
                avgCharge: avgCap, // 차트 및 파일 내보내기 호환을 위해 필드명 avgCharge 유지
                retention,
                avgCE
            });

            stepIndex++;
        }
    }

    // 2. 가로 대조용 2차원 비교 테이블 업데이트
    const thead = tableRateSummary.querySelector('thead');
    const tbody = tableRateSummary.querySelector('tbody');
    if (!thead || !tbody) return;

    const checkedDS = getCheckedDatasets();
    const displayDS = checkedDS.length > 0 ? checkedDS : datasetLibrary.filter(d => d.id === activeDatasetId);

    if (displayDS.length === 0) {
        thead.innerHTML = "";
        tbody.innerHTML = `<tr><td style="text-align: center; color: var(--text-muted);">로드된 데이터가 없습니다.</td></tr>`;
        return;
    }

    // 각 데이터셋별 요약 정보 빌드
    const datasetSummaries = displayDS.map(ds => {
        if (!ds || !ds.processedCycles) {
            return { ds: ds, summary: [] };
        }
        return {
            ds: ds,
            summary: buildRateSummaryForDataset(ds.processedCycles)
        };
    });

    // 최대 단계 수 구하기
    const maxSteps = Math.max(...datasetSummaries.map(item => item.summary.length), 0);

    if (maxSteps === 0) {
        thead.innerHTML = "";
        tbody.innerHTML = `<tr><td style="text-align: center; color: var(--text-muted);">율속 데이터가 부족합니다.</td></tr>`;
        return;
    }

    // (A) 헤더 생성
    const modeText = currentRateMode === 'charge' ? '충전 용량' : '방전 용량';
    let headerHTML = `<tr><th style="min-width: 180px;">데이터셋</th>`;
    for (let sIdx = 0; sIdx < maxSteps; sIdx++) {
        let stepName = "";
        for (let item of datasetSummaries) {
            if (item.summary[sIdx]) {
                stepName = item.summary[sIdx].rate;
                break;
            }
        }
        if (!stepName) {
            stepName = `Step ${sIdx + 1}`;
        }
        headerHTML += `<th>${stepName}<br><span style="font-size:10px; font-weight:normal; opacity:0.7;">Avg. ${modeText}</span></th>`;
    }
    headerHTML += `<th>최종 용량 유지율 (%)<br><span style="font-size:10px; font-weight:normal; opacity:0.7;">Final Retention</span></th></tr>`;
    thead.innerHTML = headerHTML;

    // (B) 바디 생성
    let bodyHTML = "";
    datasetSummaries.forEach(item => {
        const ds = item.ds;
        const summary = item.summary;
        const safeName = escapeHtml(ds.customName);

        bodyHTML += `<tr>`;
        bodyHTML += `
            <td>
                <span class="ds-color-dot" style="background:${ds.color}; display:inline-block; width:8px; height:8px; border-radius:50%; margin-right:6px; vertical-align:middle; box-shadow:0 0 6px ${ds.color};"></span>
                <strong style="vertical-align:middle; color:#fff;">${safeName}</strong>
            </td>
        `;

        for (let sIdx = 0; sIdx < maxSteps; sIdx++) {
            if (summary[sIdx]) {
                bodyHTML += `<td style="font-weight: 500;">${summary[sIdx].avgCharge.toFixed(1)} <span style="font-size:11px; opacity:0.7;">mAh/g</span></td>`;
            } else {
                bodyHTML += `<td style="color: var(--text-muted);">-</td>`;
            }
        }

        if (summary.length > 0) {
            const finalRetention = summary[summary.length - 1].retention;
            bodyHTML += `<td><span style="color: ${finalRetention >= 80 ? 'var(--color-success)' : 'var(--color-orange)'}; font-weight: 600;">${finalRetention.toFixed(1)}%</span></td>`;
        } else {
            bodyHTML += `<td style="color: var(--text-muted);">-</td>`;
        }

        bodyHTML += `</tr>`;
    });

    tbody.innerHTML = bodyHTML;
}

/**
 * dQ/dV 분석 탭 관련 비즈니스 로직
 */
// 전압 격자 선형 보간 + 중앙 차분 기반의 고정밀 dQ/dV 연산 함수
function calculateDqDv(points, stepV = 0.010, postAvg = 1) {
    const result = [];
    if (points.length < 5) return result;

    // 1. 전압 기준으로 정렬
    const sorted = [...points].sort((a, b) => a.voltage - b.voltage);
    
    const vMin = sorted[0].voltage;
    const vMax = sorted[sorted.length - 1].voltage;
    
    // 격자 스텝 간격 dV가 너무 작으면 미분 잡음이 튀므로 최소 0.001V 이상으로 보장
    const dV = Math.max(0.001, stepV);
    
    // 일정한 전압 간격 dV로 격자 데이터(Grid) 생성
    // 양 끝단의 데이터 튐 현상(끝단에서 dV가 너무 작아 미분이 발산하는 현상)을 방지하고 WonATech 장비와 매칭을 위해
    // 격자의 범위를 양 끝에서 1.0 * dV 만큼 마진을 두고 좁혀서 생성합니다.
    const grid = [];
    const gridMin = vMin + dV;
    const gridMax = vMax - dV;
    
    let sortedIdx = 0;
    for (let v = gridMin; v <= gridMax + 1e-9; v += dV) {
        // v보다 크거나 같은 첫 번째 원소의 인덱스를 투포인터로 탐색
        while (sortedIdx < sorted.length && sorted[sortedIdx].voltage < v) {
            sortedIdx++;
        }
        
        if (sortedIdx <= 0 || sortedIdx >= sorted.length) {
            continue;
        }
        
        const p0 = sorted[sortedIdx - 1];
        const p1 = sorted[sortedIdx];
        
        const dvSpan = p1.voltage - p0.voltage;
        let q = p0.capacity;
        if (dvSpan > 1e-6) {
            q = p0.capacity + (p1.capacity - p0.capacity) * (v - p0.voltage) / dvSpan;
        }
        
        grid.push({ voltage: v, capacity: q });
    }
    
    if (grid.length < 3) return result;
    
    // 2. 중앙 차분(Central Difference)으로 dQ/dV 계산 (양 끝단 1차 차분 시 튀는 값 배제 및 안정적 미분 보장)
    for (let i = 1; i < grid.length - 1; i++) {
        const prev = grid[i - 1];
        const next = grid[i + 1];
        
        const deltaV = next.voltage - prev.voltage; 
        const deltaQ = next.capacity - prev.capacity;
        
        if (Math.abs(deltaV) < 1e-6) continue;
        
        const val = deltaQ / deltaV;
        
        result.push({
            voltage: grid[i].voltage,
            dqdv: val
        });
    }
    
    if (result.length < 3) return result;
    if (postAvg <= 1) return result;

    // 3. Post-smoothing (지정한 Post-Avg. Factor 크기만큼의 이동 평균 필터 적용)
    const smoothedResult = [];
    const windowSize = parseInt(postAvg) || 1;
    const half = Math.floor(windowSize / 2);
    for (let i = 0; i < result.length; i++) {
        let sum = 0;
        let count = 0;
        for (let w = -half; w <= half; w++) {
            const idx = i + w;
            if (idx >= 0 && idx < result.length) {
                sum += result[idx].dqdv;
                count++;
            }
        }
        smoothedResult.push({
            voltage: result[i].voltage,
            dqdv: sum / count
        });
    }
    
    return smoothedResult;
}

// dQ/dV 탭 뷰 갱신
function updateDqDvView() {
    if (hasActiveDataset()) {
        renderDqDvChart();
    }
}

// dQ/dV 차트 렌더링
function renderDqDvChart() {
    const canvas = document.getElementById('chartDqDv');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    
    if (chartDqDvInstance) {
        chartDqDvInstance.destroy();
    }

    const checkedDS = getCheckedDatasets();
    const displayDS = checkedDS.length > 0 ? checkedDS : datasetLibrary.filter(d => d.id === activeDatasetId);

    if (displayDS.length === 0) {
        const tbody = document.querySelector('#tableDqDvPeaks tbody');
        if (tbody) {
            tbody.innerHTML = `<tr><td colspan="6" style="text-align: center; color: var(--text-muted);">로드된 데이터가 없습니다.</td></tr>`;
        }
        return;
    }

    // WonATech 상용 기준 파라미터 획득
    const stepVVal = dqdvStepV ? parseFloat(dqdvStepV.value) : 0.010;
    const qoVal = dqdvQo ? parseFloat(dqdvQo.value) || 1000 : 1000;
    const postAvgVal = dqdvPostAvg ? parseInt(dqdvPostAvg.value) || 1 : 1;
    
    const mode = selectDqDvMode ? selectDqDvMode.value : 'both'; // 'both', 'charge', 'discharge'

    const chartDatasets = [];
    const isCompareMode = displayDS.length >= 2;
    const computedDqDvCache = {}; // dQ/dV 중복 계산 방지를 위한 로컬 캐시 구조

    displayDS.forEach(ds => {
        if (!ds || !ds.processedCycles) return; // 안전장치: GITT 데이터셋 등 CC/CV 구조가 아닌 것은 스킵
        const dsCycles = Object.keys(ds.processedCycles).map(Number).sort((a, b) => a - b);
        if (dsCycles.length === 0) return;

        if (!computedDqDvCache[ds.id]) {
            computedDqDvCache[ds.id] = {};
        }

        // 선택된 모든 다중 사이클을 돌며 플로팅 수행
        selectedDqDvCycles.forEach(cycNum => {
            // 사이클 폴백
            let targetCyc = cycNum;
            if (!dsCycles.includes(targetCyc)) {
                targetCyc = dsCycles.reduce((prev, curr) => 
                    Math.abs(curr - cycNum) < Math.abs(prev - cycNum) ? curr : prev
                );
            }

            const cycleData = ds.processedCycles[targetCyc];
            if (!cycleData) return;

            // 충전 dQ/dV 계산 (Desodiation)
            let chargePoints = [];
            if (mode === 'both' || mode === 'charge') {
                if (cycleData.desodiation && cycleData.desodiation.length > 0) {
                    chargePoints = calculateDqDv(cycleData.desodiation, stepVVal, postAvgVal);
                }
            }

            // 방전 dQ/dV 계산 (Sodiation)
            let dischargePoints = [];
            if (mode === 'both' || mode === 'discharge') {
                if (cycleData.sodiation && cycleData.sodiation.length > 0) {
                    dischargePoints = calculateDqDv(cycleData.sodiation, stepVVal, postAvgVal);
                }
            }

            // 캐시 기록
            computedDqDvCache[ds.id][targetCyc] = {
                chargePoints: chargePoints,
                dischargePoints: dischargePoints
            };

            // 개별 데이터셋의 질량(Mass) 값 적용
            const dsMass = ds.mass !== undefined ? ds.mass : 2.58;
            const scaleFactor = (dsMass / 1000.0) / qoVal;

            let cBorderColor, dBorderColor;
            let cDash = undefined;
            let dDash = isCompareMode ? [5, 4] : undefined;
            let labelSuffix = ` (Cyc ${cycNum})`;

            const cycIdx = selectedDqDvCycles.indexOf(cycNum);
            const totalCycCount = selectedDqDvCycles.length;

            if (isCompareMode) {
                // 다중 데이터셋 상태: 데이터셋 고유색 유지하되 사이클별로 투명도 및 대시 패턴 조절
                const opacity = totalCycCount <= 1 ? 1.0 : 0.45 + (cycIdx * 0.55 / (totalCycCount - 1));
                cBorderColor = hexToRgba(ds.color, opacity);
                dBorderColor = hexToRgba(ds.color, opacity);
                
                if (cycIdx > 0) {
                    cDash = [2 * cycIdx, 2];
                    dDash = [5, 4, 2 * cycIdx, 2];
                }
            } else {
                // 단일 데이터셋 상태: WonATech 표준색(충전 빨강, 방전 파랑) 기반 투명도 매핑
                const opacity = totalCycCount <= 1 ? 1.0 : 0.45 + (cycIdx * 0.55 / (totalCycCount - 1));
                cBorderColor = hexToRgba('#ef4444', opacity);
                dBorderColor = hexToRgba('#3b82f6', opacity);
                
                if (cycIdx > 0) {
                    cDash = [2 * cycIdx, 2];
                    dDash = [5, 4, 2 * cycIdx, 2];
                }
            }

            // 충전 곡선 데이터셋 추가
            if (chargePoints.length > 0) {
                chartDatasets.push({
                    label: `${ds.customName}${labelSuffix} (Charge)`,
                    data: chargePoints.map(p => ({ x: p.voltage, y: p.dqdv * scaleFactor })),
                    borderColor: cBorderColor,
                    backgroundColor: 'transparent',
                    borderWidth: 2,
                    borderDash: cDash,
                    pointRadius: 0,
                    pointHoverRadius: 4,
                    tension: 0.15,
                    fill: false
                });
            }

            // 방전 곡선 데이터셋 추가
            if (dischargePoints.length > 0) {
                chartDatasets.push({
                    label: `${ds.customName}${labelSuffix} (Discharge)`,
                    data: dischargePoints.map(p => ({ x: p.voltage, y: p.dqdv * scaleFactor })),
                    borderColor: dBorderColor,
                    backgroundColor: 'transparent',
                    borderWidth: 2,
                    borderDash: dDash,
                    pointRadius: 0,
                    pointHoverRadius: 4,
                    tension: 0.15,
                    fill: false
                });
            }
        });
    });

    chartDqDvInstance = new Chart(ctx, {
        type: 'line',
        data: { datasets: chartDatasets },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            scales: {
                x: {
                    type: 'linear',
                    title: { display: true, text: 'Voltage [V]', color: '#fff' },
                    grid: { color: 'rgba(255, 255, 255, 0.05)' },
                    ticks: { color: '#9ca3af' }
                },
                y: {
                    title: { display: true, text: '1/Qo * dQ / dv [1/V]', color: '#fff' },
                    grid: { color: 'rgba(255, 255, 255, 0.05)' },
                    ticks: { color: '#9ca3af' }
                }
            },
            plugins: {
                legend: {
                    display: true,
                    labels: {
                        color: '#fff',
                        boxWidth: 14,
                        padding: 10,
                        filter: function(item, chartData) {
                            if (isCompareMode) {
                                // 다중 데이터셋 오버레이 상태
                                if (item.text.includes('(Discharge)')) {
                                    return false;
                                }
                                // Charge 단어를 떼고 데이터셋명과 사이클명만 노출
                                item.text = item.text.replace(' (Charge)', '');
                                return true;
                            }
                            // 단일 데이터셋 오버레이 상태: 충/방전 및 사이클명이 범례에 다 구별되어 나오도록 그대로 유지
                            return true;
                        }
                    }
                },
                tooltip: {
                    callbacks: {
                        label: function(context) {
                            let label = context.dataset.label || '';
                            if (label) {
                                label += ': ';
                            }
                            if (context.parsed.y !== null) {
                                label += `${context.parsed.y.toFixed(5)} 1/V at ${context.parsed.x.toFixed(3)} V`;
                            }
                            return label;
                        }
                    }
                }
            }
        }
    });

    // 테이블 정보 업데이트 (다중 사이클 선택을 적용하므로 targetCycleNum 매개변수는 무시됨, 캐시 데이터 전달)
    updateDqDvTable(displayDS, null, stepVVal, qoVal, postAvgVal, computedDqDvCache);
}

// dQ/dV 주요 산화환원 피크 요약 테이블 갱신
function updateDqDvTable(displayDS, targetCycleNum, stepVVal, qoVal, postAvgVal, computedDqDvCache = null) {
    const tbody = document.querySelector('#tableDqDvPeaks tbody');
    if (!tbody) return;
    
    let html = "";
    
    displayDS.forEach(ds => {
        if (!ds || !ds.processedCycles) return; // 안전장치: GITT 데이터셋 등 CC/CV가 아닌 것은 스킵
        const dsCycles = Object.keys(ds.processedCycles).map(Number).sort((a, b) => a - b);
        if (dsCycles.length === 0) return;
        
        // 선택된 모든 다중 사이클을 돌며 행 추가
        selectedDqDvCycles.forEach(cycNum => {
            if (!dsCycles.includes(cycNum)) return; // 해당 데이터셋에 사이클이 없으면 생략
            
            const cycleData = ds.processedCycles[cycNum];
            if (!cycleData) return;

            // 개별 데이터셋의 질량(Mass) 값 적용 (없을 시 폴백 2.58)
            const dsMass = ds.mass !== undefined ? ds.mass : 2.58;
            const scaleFactor = (dsMass / 1000.0) / qoVal;
            
            let chargeDqDv = [];
            let dischargeDqDv = [];

            // 캐시가 존재하고 현재 사이클에 대한 데이터가 있으면 재사용
            if (computedDqDvCache && computedDqDvCache[ds.id] && computedDqDvCache[ds.id][cycNum]) {
                chargeDqDv = computedDqDvCache[ds.id][cycNum].chargePoints || [];
                dischargeDqDv = computedDqDvCache[ds.id][cycNum].dischargePoints || [];
            } else {
                if (cycleData.desodiation && cycleData.desodiation.length > 0) {
                    chargeDqDv = calculateDqDv(cycleData.desodiation, stepVVal, postAvgVal);
                }
                if (cycleData.sodiation && cycleData.sodiation.length > 0) {
                    dischargeDqDv = calculateDqDv(cycleData.sodiation, stepVVal, postAvgVal);
                }
            }
            
            // 환원 피크(방전 최솟값) 검출
            let minDqDv = 0;
            let minVolt = 0;
            if (dischargeDqDv.length > 0) {
                let minItem = dischargeDqDv[0];
                dischargeDqDv.forEach(item => {
                    if (item.dqdv < minItem.dqdv) {
                        minItem = item;
                    }
                });
                minDqDv = minItem.dqdv * scaleFactor;
                minVolt = minItem.voltage;
            }
            
            // 산화 피크(충전 최댓값) 검출
            let maxDqDv = 0;
            let maxVolt = 0;
            if (chargeDqDv.length > 0) {
                let maxItem = chargeDqDv[0];
                chargeDqDv.forEach(item => {
                    if (item.dqdv > maxItem.dqdv) {
                        maxItem = item;
                    }
                });
                maxDqDv = maxItem.dqdv * scaleFactor;
                maxVolt = maxItem.voltage;
            }
            
            const safeName = escapeHtml(ds.customName);
            
            html += `
                <tr>
                    <td>
                        <span class="ds-color-dot" style="background:${ds.color}; display:inline-block; width:8px; height:8px; border-radius:50%; margin-right:6px; vertical-align:middle; box-shadow:0 0 6px ${ds.color};"></span>
                        <strong style="vertical-align:middle; color:#fff;">${safeName}</strong>
                    </td>
                    <td style="font-weight: 500;">${cycNum} Cycle</td>
                    <td style="font-weight: 500; color: #3b82f6;">${minVolt !== 0 ? minVolt.toFixed(3) + ' V' : '-'}</td>
                    <td style="font-weight: 500; color: #60a5fa;">${minDqDv !== 0 ? minDqDv.toFixed(5) + ' 1/V' : '-'}</td>
                    <td style="font-weight: 500; color: #ec4899;">${maxVolt !== 0 ? maxVolt.toFixed(3) + ' V' : '-'}</td>
                    <td style="font-weight: 500; color: #f472b6;">${maxDqDv !== 0 ? maxDqDv.toFixed(5) + ' 1/V' : '-'}</td>
                </tr>
            `;
        });
    });
    
    tbody.innerHTML = html || `<tr><td colspan="6" style="text-align: center; color: var(--text-muted);">선택된 사이클의 데이터가 없습니다.</td></tr>`;
}

/**
 * dQ/dV 분석 탭 내 다중 사이클 선택 칩 목록을 렌더링하고 이벤트를 바인딩합니다.
 */
function renderCycleChipsUI() {
    const container = document.getElementById('cycleChipsContainer');
    if (!container) return;

    container.innerHTML = '';

    const cycleNumbers = Object.keys(processedCycles).map(Number).sort((a, b) => a - b);
    if (cycleNumbers.length === 0) {
        container.innerHTML = '<span style="font-size:11px; color:var(--text-muted);">사이클 데이터가 없습니다.</span>';
        return;
    }

    // 전역 배열 유효하지 않은 사이클 제거 방어
    selectedDqDvCycles = selectedDqDvCycles.filter(c => cycleNumbers.includes(c));
    if (selectedDqDvCycles.length === 0 && cycleNumbers.length > 0) {
        selectedDqDvCycles = [cycleNumbers[0]];
    }

    cycleNumbers.forEach(cNum => {
        const chip = document.createElement('div');
        const isActive = selectedDqDvCycles.includes(cNum);
        chip.className = `cycle-chip${isActive ? ' active' : ''}`;
        chip.textContent = `${cNum}C`;
        chip.title = `${cNum} Cycle`;

        chip.addEventListener('click', () => {
            const index = selectedDqDvCycles.indexOf(cNum);
            if (index > -1) {
                // 활성화된 칩 클릭 -> 1개 이상 활성화 보장
                if (selectedDqDvCycles.length > 1) {
                    selectedDqDvCycles.splice(index, 1);
                } else {
                    return; // 1개만 있을 땐 해제 불가
                }
            } else {
                // 비활성 칩 클릭 -> 활성화 및 정렬
                selectedDqDvCycles.push(cNum);
                selectedDqDvCycles.sort((a, b) => a - b);
            }
            
            // 호환성을 위해 숨겨진 targetCycleDqDv 셀렉터의 값도 동기화
            if (targetCycleDqDv) {
                targetCycleDqDv.value = selectedDqDvCycles[0].toString();
            }

            renderCycleChipsUI();
            updateDqDvView();
        });

        container.appendChild(chip);
    });
}

/**
 * 퀵 액션 필터 버튼 이벤트 바인딩
 */
function initCycleQuickActions() {
    const btnAll = document.getElementById('btnCycleAll');
    const btnClear = document.getElementById('btnCycleClear');
    const btnOdd = document.getElementById('btnCycleOdd');
    const btnEven = document.getElementById('btnCycleEven');

    const getCycles = () => Object.keys(processedCycles).map(Number).sort((a, b) => a - b);

    if (btnAll) {
        btnAll.onclick = () => {
            const cycles = getCycles();
            if (cycles.length > 0) {
                selectedDqDvCycles = [...cycles];
                renderCycleChipsUI();
                updateDqDvView();
            }
        };
    }

    if (btnClear) {
        btnClear.onclick = () => {
            const cycles = getCycles();
            if (cycles.length > 0) {
                selectedDqDvCycles = [cycles[0]];
                renderCycleChipsUI();
                updateDqDvView();
            }
        };
    }

    if (btnOdd) {
        btnOdd.onclick = () => {
            const cycles = getCycles();
            selectedDqDvCycles = cycles.filter(c => c % 2 !== 0);
            if (selectedDqDvCycles.length === 0 && cycles.length > 0) {
                selectedDqDvCycles = [cycles[0]];
            }
            renderCycleChipsUI();
            updateDqDvView();
        };
    }

    if (btnEven) {
        btnEven.onclick = () => {
            const cycles = getCycles();
            selectedDqDvCycles = cycles.filter(c => c % 2 === 0);
            if (selectedDqDvCycles.length === 0 && cycles.length > 0) {
                selectedDqDvCycles = [cycles[0]];
            }
            renderCycleChipsUI();
            updateDqDvView();
        };
    }
}

/* ==========================================
   4. Chart.js Visualization Rendering
   ========================================== */
/**
 * 대용량 데이터 렌더링 시 브라우저 렉(응답없음)을 방지하기 위한 최대 포인트 다운샘플링 함수
 */
function downsamplePoints(points, maxPoints = 1500) {
    if (!points || points.length <= maxPoints) return points || [];
    const step = Math.ceil(points.length / maxPoints);
    const sampled = [];
    for (let i = 0; i < points.length; i += step) {
        sampled.push(points[i]);
    }
    if (sampled.length > 0 && points.length > 0 && sampled[sampled.length - 1] !== points[points.length - 1]) {
        sampled.push(points[points.length - 1]);
    }
    return sampled;
}

function renderOverviewChart(cycleData, isAll = false) {
    const ctx = document.getElementById('chartProfile').getContext('2d');
    
    if (chartProfileInstance) {
        chartProfileInstance.destroy();
    }

    const datasets = [];
    const checkedDS = getCheckedDatasets();
    const isCompareMode = checkedDS.length >= 2;
    const direction = targetDirectionProfile ? targetDirectionProfile.value : 'all';

    // 1. 그릴 대상 데이터셋 수집
    const displayDS = isCompareMode ? checkedDS : datasetLibrary.filter(d => d.id === activeDatasetId);
    if (displayDS.length === 0) return;

    if (isProfileCycleAll) {
        // ===== 전체 사이클 모드: 모든 데이터셋의 모든 사이클을 그림 =====
        displayDS.forEach(ds => {
            const dsCycles = Object.keys(ds.processedCycles).map(Number).sort((a, b) => a - b);
            const totalCycles = dsCycles.length;
            if (totalCycles === 0) return;

            dsCycles.forEach((cNum, idx) => {
                const cyc = ds.processedCycles[cNum];
                if (!cyc) return;

                const sodData = downsamplePoints((cyc.sodiation || []).map(p => ({ x: p.capacity, y: p.voltage })), 300);
                const desodData = downsamplePoints((cyc.desodiation || []).map(p => ({ x: p.capacity, y: p.voltage })), 300);
                
                let mergedData = [];
                let directionLabel = '';
                if (direction === 'charge') {
                    mergedData = desodData;
                    directionLabel = ' (Charge)';
                } else if (direction === 'discharge') {
                    mergedData = sodData;
                    directionLabel = ' (Discharge)';
                } else {
                    mergedData = [...sodData, ...desodData];
                }

                // 범례 및 색상 지정
                let color;
                let labelName;

                if (isCompareMode) {
                    // 비교 모드: 데이터셋 고유 컬러에 그라데이션 적용
                    const opacity = 0.25 + (idx * 0.75 / Math.max(1, totalCycles - 1));
                    color = hexToRgba(ds.color, opacity);
                    labelName = idx === 0 ? `${ds.customName}${directionLabel}` : undefined;
                } else {
                    // 단일 데이터셋 전체 모드: 사이클 번호마다 다채로운 hsla 컬러 지정
                    const hue = (idx * 280 / Math.max(1, totalCycles - 1));
                    color = `hsla(${hue}, 85%, 55%, 0.8)`;
                    labelName = `Cycle ${cNum}${directionLabel}`;
                }

                datasets.push({
                    label: labelName,
                    data: mergedData,
                    borderColor: color,
                    backgroundColor: 'transparent',
                    showLine: true,
                    pointRadius: 0,
                    fill: false,
                    borderWidth: isCompareMode ? 1.5 : 1.5,
                    tension: 0.1
                });
            });
        });
    } else {
        // ===== 여러 사이클 / 단일 사이클 선택 모드 =====
        const isSingleSelected = selectedProfileCycles.length === 1;

        displayDS.forEach(ds => {
            const dsCycles = Object.keys(ds.processedCycles).map(Number).sort((a, b) => a - b);
            if (dsCycles.length === 0) return;

            // 각 데이터셋별로 그릴 사이클 번호 결정
            const targetCyclesToDraw = [];
            selectedProfileCycles.forEach(targetCNum => {
                if (dsCycles.includes(targetCNum)) {
                    targetCyclesToDraw.push(targetCNum);
                } else if (isSingleSelected) {
                    // 단일 사이클 선택 시에만 fallback 허용
                    const fallbackCNum = dsCycles.reduce((prev, curr) => Math.abs(curr - targetCNum) < Math.abs(prev - targetCNum) ? curr : prev);
                    targetCyclesToDraw.push(fallbackCNum);
                }
                // 다중 선택 시 해당 dataset에 없으면 skip
            });

            targetCyclesToDraw.forEach(cNum => {
                const cyc = ds.processedCycles[cNum];
                if (!cyc) return;

                // 단일 사이클 1개 그릴 때는 1500포인트 샘플링, 여러 개일 때는 600포인트 샘플링으로 렉 방지
                const maxPts = (displayDS.length === 1 && targetCyclesToDraw.length === 1) ? 1500 : 600;
                const sodData = downsamplePoints((cyc.sodiation || []).map(p => ({ x: p.capacity, y: p.voltage })), maxPts);
                const desodData = downsamplePoints((cyc.desodiation || []).map(p => ({ x: p.capacity, y: p.voltage })), maxPts);

                let mergedData = [];
                let directionLabel = '';
                if (direction === 'charge') {
                    mergedData = desodData;
                    directionLabel = ' (Charge)';
                } else if (direction === 'discharge') {
                    mergedData = sodData;
                    directionLabel = ' (Discharge)';
                } else {
                    mergedData = [...sodData, ...desodData];
                }

                // 범례 표시명 결정
                let labelName = `${ds.customName} (Cycle ${cNum})${directionLabel}`;
                if (!isCompareMode && targetCyclesToDraw.length === 1) {
                    // 단일 데이터셋 단일 사이클 기본 상태
                    if (direction === 'all') {
                        // Sodiation / Desodiation 개별 범례로 2개 추가
                        datasets.push({
                            label: 'Sodiation (Discharge)',
                            data: sodData,
                            borderColor: 'rgba(245, 158, 11, 0.95)',
                            backgroundColor: 'rgba(245, 158, 11, 0.1)',
                            showLine: true,
                            borderWidth: 2.5,
                            pointRadius: 0,
                            fill: false,
                            tension: 0.1
                        });
                        datasets.push({
                            label: 'Desodiation (Charge)',
                            data: desodData,
                            borderColor: 'rgba(59, 130, 246, 0.95)',
                            backgroundColor: 'rgba(59, 130, 246, 0.1)',
                            showLine: true,
                            borderWidth: 2.5,
                            pointRadius: 0,
                            fill: false,
                            tension: 0.1
                        });
                        return; // 아래 공통 push 스킵
                    } else if (direction === 'discharge') {
                        labelName = 'Sodiation (Discharge)';
                    } else {
                        labelName = 'Desodiation (Charge)';
                    }
                }

                // 다중 데이터셋 / 다중 사이클 범례 추가
                // 단일 데이터셋 내 여러 사이클일 때는 다채로운 색상 부여
                let color = ds.color;
                if (!isCompareMode && targetCyclesToDraw.length > 1) {
                    const idx = targetCyclesToDraw.indexOf(cNum);
                    const hue = (idx * 280 / Math.max(1, targetCyclesToDraw.length - 1));
                    color = `hsla(${hue}, 85%, 55%, 0.8)`;
                    labelName = `Cycle ${cNum}${directionLabel}`;
                }

                datasets.push({
                    label: labelName,
                    data: mergedData,
                    borderColor: color,
                    backgroundColor: 'transparent',
                    showLine: true,
                    borderWidth: 2.5,
                    pointRadius: 0,
                    fill: false,
                    tension: 0.1
                });
            });
        });
    }

    const showLegend = isCompareMode || isProfileCycleAll || selectedProfileCycles.length > 1 || direction !== 'all';

    chartProfileInstance = new Chart(ctx, {
        type: 'scatter',
        data: { datasets },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            animation: { duration: (isProfileCycleAll && !isCompareMode) ? 0 : 400 },
            scales: {
                x: {
                    type: 'linear',
                    title: { display: true, text: 'Specific Capacity (mAh/g)', color: '#fff', font: { size: 12, weight: '600' } },
                    grid: { color: 'rgba(255, 255, 255, 0.05)' },
                    ticks: { color: '#9ca3af' }
                },
                y: {
                    type: 'linear',
                    title: { display: true, text: 'Voltage (V vs. Na/Na+)', color: '#fff', font: { size: 12, weight: '600' } },
                    grid: { color: 'rgba(255, 255, 255, 0.05)' },
                    ticks: { color: '#9ca3af' }
                }
            },
            plugins: {
                legend: {
                    display: false
                },
                tooltip: {
                    callbacks: {
                        label: function(context) {
                            return `Cap: ${context.parsed.x.toFixed(2)} mAh/g, Volt: ${context.parsed.y.toFixed(4)} V`;
                        }
                    }
                }
            }
        }
    });
}

function renderSlopePlateauChart(cycleData, cutoffV) {
    const ctx = document.getElementById('chartSlopePlateau').getContext('2d');
    if (chartSlopePlateauInstance) chartSlopePlateauInstance.destroy();

    const checkedDS = getCheckedDatasets();
    const isCompareMode = checkedDS.length >= 2;

    let chartDatasets = [];

    if (isCompareMode) {
        // ===== 비교 모드: 체크된 데이터셋마다 전압 프로파일 창에서 선택된 사이클 기준으로 방전(Sodiation) 코스 오버레이 =====
        const targetCycleNum = parseInt(targetCycleSP.value) || 1;

        checkedDS.forEach(ds => {
            if (!ds || !ds.processedCycles) return; // 안전장치: GITT 데이터셋 등 CC/CV가 아닌 것은 스킵
            const dsCycles = Object.keys(ds.processedCycles).map(Number).sort((a, b) => a - b);
            if (dsCycles.length === 0) return;

            let cNum = targetCycleNum;
            if (!dsCycles.includes(cNum)) {
                // 선택된 사이클이 없을 경우 가장 가까운 사이클로 폴백
                cNum = dsCycles.reduce((prev, curr) => Math.abs(curr - targetCycleNum) < Math.abs(prev - targetCycleNum) ? curr : prev);
            }

            const cyc = ds.processedCycles[cNum];
            if (!cyc || !cyc.sodiation) return;

            // 개요 창과 동일하게 전체 방전 데이터를 먼저 다운샘플링하여 끊김을 방지합니다.
            const allData = downsamplePoints(
                cyc.sodiation.map(p => ({ x: p.capacity, y: p.voltage })), 1500
            );

            chartDatasets.push({
                label: `${ds.customName} (Cycle ${cNum})`,
                data: allData,
                borderColor: ds.color,
                backgroundColor: 'transparent',
                showLine: true,
                borderWidth: 2.5,
                pointRadius: 0,
                fill: false,
                tension: 0.1
            });
        });

        // Cut-off 선 추가 (다중 데이터셋 중 해당 사이클의 가장 큰 방전 용량 기준)
        const maxCap = Math.max(...checkedDS.map(ds => {
            const dsCycles = Object.keys(ds.processedCycles).map(Number).sort((a, b) => a - b);
            if (dsCycles.length === 0) return 0;

            let cNum = targetCycleNum;
            if (!dsCycles.includes(cNum)) {
                cNum = dsCycles.reduce((prev, curr) => Math.abs(curr - targetCycleNum) < Math.abs(prev - targetCycleNum) ? curr : prev);
            }
            const cyc = ds.processedCycles[cNum];
            return cyc ? (cyc.totalDischargeCap || 0) : 0;
        }));
        chartDatasets.push({
            label: `Cut-off (${cutoffV.toFixed(2)} V)`,
            data: [{ x: 0, y: cutoffV }, { x: maxCap * 1.05, y: cutoffV }],
            borderColor: 'rgba(239, 68, 68, 0.65)',
            borderWidth: 1.5,
            borderDash: [5, 5],
            showLine: true,
            pointRadius: 0,
            fill: false
        });
    } else {
        // ===== 단일 데이터셋: Slope/Plateau 영역 하이라이트 =====
        if (!cycleData) { chartSlopePlateauInstance = null; return; }
        
        // 개요 창과 동일하게 전체 방전 데이터를 먼저 다운샘플링합니다.
        const allSodData = downsamplePoints(
            cycleData.sodiation.map(p => ({ x: p.capacity, y: p.voltage })), 1500
        );

        let slopeData = [];
        let plateauData = [];

        // 다운샘플링된 전체 데이터에서 cutoffV 이하로 떨어지는 첫 번째 지점을 찾습니다.
        const transitionIdx = allSodData.findIndex(p => p.y <= cutoffV);
        if (transitionIdx === -1) {
            slopeData = allSodData;
        } else {
            // Slope와 Plateau 영역이 매끄럽게 이어지도록 경계 포인트(transitionIdx)를 둘 다에 포함합니다.
            slopeData = allSodData.slice(0, transitionIdx + 1);
            plateauData = allSodData.slice(transitionIdx);
        }

        chartDatasets = [
            {
                label: `Slope Region (> ${cutoffV.toFixed(2)} V)`,
                data: slopeData,
                borderColor: 'rgba(6, 182, 212, 0.95)',
                backgroundColor: 'rgba(6, 182, 212, 0.08)',
                showLine: true, borderWidth: 3, pointRadius: 0, fill: true, tension: 0.1
            },
            {
                label: `Plateau Region (≤ ${cutoffV.toFixed(2)} V)`,
                data: plateauData,
                borderColor: 'rgba(139, 92, 246, 0.95)',
                backgroundColor: 'rgba(139, 92, 246, 0.08)',
                showLine: true, borderWidth: 3, pointRadius: 0, fill: true, tension: 0.1
            },
            {
                label: 'Cut-off Voltage',
                data: [{ x: 0, y: cutoffV }, { x: cycleData.totalDischargeCap * 1.05, y: cutoffV }],
                borderColor: 'rgba(239, 68, 68, 0.65)',
                borderWidth: 1.5, borderDash: [5, 5], showLine: true, pointRadius: 0, fill: false
            }
        ];
    }

    chartSlopePlateauInstance = new Chart(ctx, {
        type: 'scatter',
        data: { datasets: chartDatasets },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            scales: {
                x: {
                    type: 'linear',
                    title: { display: true, text: 'Discharge Capacity (mAh/g)', color: '#fff', font: { size: 12, weight: '600' } },
                    grid: { color: 'rgba(255, 255, 255, 0.05)' },
                    ticks: { color: '#9ca3af' }
                },
                y: {
                    type: 'linear',
                    title: { display: true, text: 'Voltage (V vs. Na/Na+)', color: '#fff', font: { size: 12, weight: '600' } },
                    grid: { color: 'rgba(255, 255, 255, 0.05)' },
                    ticks: { color: '#9ca3af' },
                    suggestedMin: -0.05,
                    suggestedMax: 2.1
                }
            },
            plugins: {
                legend: { labels: { color: '#fff', boxWidth: 14, padding: 10 } }
            }
        }
    });
}

function renderRateCapabilityCharts() {
    const ctxCycles  = document.getElementById('chartRateCycles').getContext('2d');
    const ctxSummary = document.getElementById('chartRateSummary').getContext('2d');

    const checkedDS = getCheckedDatasets();
    const isCompareMode = checkedDS.length >= 2;

    let stepSize = 5;
    const rateStepSizeSelect = document.getElementById('rateStepSize');
    if (rateStepSizeSelect) stepSize = parseInt(rateStepSizeSelect.value) || 5;

    const rateBaseColors = [
        'rgba(59, 130, 246, 0.85)',
        'rgba(6, 182, 212, 0.85)',
        'rgba(16, 185, 129, 0.85)',
        'rgba(245, 158, 11, 0.85)',
        'rgba(139, 92, 246, 0.85)',
        'rgba(236, 72, 153, 0.85)'
    ];

    if (chartRateCyclesInstance) chartRateCyclesInstance.destroy();
    if (chartRateSummaryInstance) chartRateSummaryInstance.destroy();

    // ========================
    // 1. Cycle-by-Cycle 용량 추이 선 차트
    // ========================
    const cycleLineDatasets = [];

    const datasetsForCycles = isCompareMode ? checkedDS : [
        // 싱글 모드: 현재 활성 데이터셋만 구성
        {
            customName: activeDatasetId
                ? (datasetLibrary.find(d => d.id === activeDatasetId) || { customName: 'Active' }).customName
                : 'Active',
            color: '#60a5fa',
            processedCycles,
            compareEnabled: true
        }
    ];

    datasetsForCycles.forEach(ds => {
        const cycleNumbers = Object.keys(ds.processedCycles).map(Number).sort((a, b) => a - b);
        const trace = [];
        const pointColors = [];

        cycleNumbers.forEach((cNum, idx) => {
            const data = ds.processedCycles[cNum];
            const capVal = currentRateMode === 'charge' ? data.totalChargeCap : data.totalDischargeCap;
            trace.push(capVal);
            const stepIdx = Math.floor(idx / stepSize);
            pointColors.push(rateBaseColors[stepIdx] || 'rgba(255,255,255,0.5)');
        });

        // 비교 모드: 데이터셋 고유색상으로, 싱글 모드: 단계별 구분색
        const borderClr = isCompareMode ? ds.color : 'rgba(255,255,255,0.18)';
        const bgColors  = isCompareMode ? Array(trace.length).fill(ds.color) : pointColors;

        cycleLineDatasets.push({
            label: ds.customName,
            data: trace,
            labels: cycleNumbers, // 사용자지정 툴팁
            borderColor: borderClr,
            backgroundColor: bgColors,
            pointBackgroundColor: bgColors,
            pointRadius: 5,
            pointHoverRadius: 7,
            borderWidth: isCompareMode ? 2 : 1.5,
            tension: 0.1,
            // 비교 모드에서는 선이 진하게 0로 철
            segment: isCompareMode ? {} : undefined
        });
    });

    // 사이클 레이블: 모든 데이터셋의 합집합 (중복 제거)
    const allCycleNums = [...new Set(
        datasetsForCycles.flatMap(ds => Object.keys(ds.processedCycles).map(Number))
    )].sort((a, b) => a - b);

    chartRateCyclesInstance = new Chart(ctxCycles, {
        type: 'line',
        data: { labels: allCycleNums, datasets: cycleLineDatasets },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            scales: {
                x: {
                    title: { display: true, text: 'Cycle Number', color: '#fff' },
                    grid: { color: 'rgba(255,255,255,0.05)' },
                    ticks: { color: '#9ca3af' }
                },
                y: {
                    title: { display: true, text: 'Specific Capacity (mAh/g)', color: '#fff' },
                    grid: { color: 'rgba(255,255,255,0.05)' },
                    ticks: { color: '#9ca3af' }
                }
            },
            plugins: {
                legend: {
                    display: isCompareMode,
                    labels: { color: '#fff', boxWidth: 14, padding: 10 }
                }
            }
        }
    });

    // ========================
    // 2. Rate Summary 바 차트 (단계별 평균 용량)
    // ========================
    const summaryLabels = rateCapabilitySummary.map(s => s.rate);

    let summaryDatasets;
    if (isCompareMode) {
        // 데이터셋마다 하나씩 구돉바 (grouped bar)
        summaryDatasets = checkedDS.map(ds => {
            if (!ds || !ds.processedCycles) return { label: (ds ? ds.customName : ''), data: [] };
            const summary = buildRateSummaryForDataset(ds.processedCycles);
            return {
                label: ds.customName,
                data: summary.map(s => s.avgCharge),
                backgroundColor: ds.color,
                borderRadius: 5,
                borderWidth: 0
            };
        });
    } else {
        summaryDatasets = [{
            label: 'Avg. Capacity (mAh/g)',
            data: rateCapabilitySummary.map(s => s.avgCharge),
            backgroundColor: rateBaseColors.slice(0, summaryLabels.length),
            borderRadius: 6,
            borderWidth: 0
        }];
    }

    chartRateSummaryInstance = new Chart(ctxSummary, {
        type: 'bar',
        data: { labels: summaryLabels, datasets: summaryDatasets },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            scales: {
                x: { grid: { display: false }, ticks: { color: '#9ca3af' } },
                y: {
                    title: { display: true, text: 'Capacity (mAh/g)', color: '#fff' },
                    grid: { color: 'rgba(255,255,255,0.05)' },
                    ticks: { color: '#9ca3af' }
                }
            },
            plugins: {
                legend: {
                    display: isCompareMode,
                    labels: { color: '#fff', boxWidth: 14, padding: 10 }
                }
            }
        }
    });
}

/**
 * 특정 processedCycles 데이터를 기반으로 율속 요약을 빌드하는 보조 함수
 * (비교 모드에서 각 데이터셋의 바 차트 데이터 생성 시 사용)
 */
function buildRateSummaryForDataset(targetProcessedCycles) {
    const summary = [];
    const cycles = Object.keys(targetProcessedCycles).map(Number).sort((a, b) => a - b);
    if (cycles.length < 2) return summary;

    let stepSize = 5;
    const sel = document.getElementById('rateStepSize');
    if (sel) stepSize = parseInt(sel.value) || 5;

    const activeUnitBtn = document.querySelector('.rate-unit-btn.active');
    const unitSuffix = (activeUnitBtn && activeUnitBtn.dataset.unit === 'mag') ? ' mA/g' : ' C';

    const rateStepsInput = document.getElementById('rateStepsInput');
    let userStepValues = [];
    if (rateStepsInput && rateStepsInput.value.trim()) {
        userStepValues = rateStepsInput.value.split(',').map(s => s.trim()).filter(s => s !== '' && !isNaN(parseFloat(s)));
    }

    let baseCap = 0;
    let stepIndex = 0;

    for (let i = 0; i < cycles.length; i += stepSize) {
        const stepCycles = cycles.slice(i, i + stepSize);
        if (!stepCycles.length) break;

        let sumCap = 0, validCount = 0;
        stepCycles.forEach(cNum => {
            const cyc = targetProcessedCycles[cNum];
            const capVal = currentRateMode === 'charge'
                ? (cyc ? cyc.totalChargeCap : 0)
                : (cyc ? cyc.totalDischargeCap : 0);
            if (cyc && capVal > 0) { sumCap += capVal; validCount++; }
        });
        if (!validCount) { stepIndex++; continue; }

        const avgCharge = sumCap / validCount;
        if (stepIndex === 0) baseCap = avgCharge;
        const retention = baseCap > 0 ? (avgCharge / baseCap) * 100 : 0;

        let rateName = `Step ${stepIndex + 1}`;
        if (userStepValues.length > 0 && stepIndex < userStepValues.length) {
            rateName = `${parseFloat(userStepValues[stepIndex])}${unitSuffix}`;
        }

        summary.push({ rate: rateName, avgCharge, retention });
        stepIndex++;
    }
    return summary;
}


/* ==========================================
   6. Exporting Utilities
   ========================================== */
function initExportFeatures() {
    // 1차 사이클 프로파일 다운로드
    btnDownloadProfile.addEventListener('click', () => {
        if (!hasActiveDataset()) return;
        downloadChartImage(chartProfileInstance, 'voltage_profile_cycle_' + targetCycleSelect.value);
    });

    // 1차 사이클 프로파일 엑셀 내보내기
    if (btnDownloadProfileExcel) {
        btnDownloadProfileExcel.addEventListener('click', () => {
            exportVoltageProfileDataToExcel();
        });
    }

    // Slope/Plateau 하이라이트 차트 다운로드
    btnDownloadSlopeChart.addEventListener('click', () => {
        if (!hasActiveDataset()) return;
        downloadChartImage(chartSlopePlateauInstance, 'slope_plateau_analysis');
    });

    // 정제된 C-rate 율속 요약 데이터를 엑셀로 내보내기
    btnDownloadRateData.addEventListener('click', () => {
        if (rateCapabilitySummary.length === 0) return;
        
        // 데이터 배열 생성
        const data = [
            ["C-rate", "Cycle Range", "Avg Charge Capacity (mAh/g)", "Retention (%)", "Avg Coulombic Efficiency (%)"]
        ];
        
        rateCapabilitySummary.forEach(row => {
            data.push([
                row.rate,
                row.cycleRange,
                parseFloat(row.avgCharge.toFixed(2)),
                parseFloat(row.retention.toFixed(2)),
                parseFloat(row.avgCE.toFixed(2))
            ]);
        });

        // 엑셀 워크시트 및 워크북 생성
        const worksheet = XLSX.utils.aoa_to_sheet(data);
        const workbook = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(workbook, worksheet, "Rate Capability Summary");

        // 엑셀 바이너리 파일 데이터 생성
        const wbout = XLSX.write(workbook, { bookType: 'xlsx', type: 'array' });
        
        // 응답 콘텐츠 타입에 상응하는 엑셀 바이너리 Blob 객체 생성
        const blob = new Blob([wbout], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
        
        // 오늘 날짜 포맷 (YYYYMMDD) 생성
        const today = new Date();
        const yyyy = today.getFullYear();
        const mm = String(today.getMonth() + 1).padStart(2, '0');
        const dd = String(today.getDate()).padStart(2, '0');
        const formattedDate = `${yyyy}${mm}${dd}`;

        // a 태그를 생성하여 download 속성을 명시한 후 강제 클릭 유도 (한글명 인코딩 유지)
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = url;
        link.download = `율속요약_분석결과_${formattedDate}.xlsx`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
    });

    // 상세 사이클별 피팅 용량 데이터를 엑셀로 내보내기
    if (btnDownloadRateDetailData) {
        btnDownloadRateDetailData.addEventListener('click', () => {
            const cycleNumbers = Object.keys(processedCycles).map(Number).sort((a, b) => a - b);
            if (cycleNumbers.length === 0) {
                alert("내보낼 데이터가 없습니다.");
                return;
            }
            
            // 데이터 배열 생성
            const data = [
                ["Cycle", "Charge Capacity (mAh/g)", "Discharge Capacity (mAh/g)"]
            ];
            
            cycleNumbers.forEach(cNum => {
                const cyc = processedCycles[cNum];
                const chargeCap = cyc ? parseFloat(cyc.totalChargeCap.toFixed(2)) : 0;
                const dischargeCap = cyc ? parseFloat(cyc.totalDischargeCap.toFixed(2)) : 0;
                data.push([cNum, chargeCap, dischargeCap]);
            });

            // 엑셀 워크시트 및 워크북 생성
            const worksheet = XLSX.utils.aoa_to_sheet(data);
            const workbook = XLSX.utils.book_new();
            XLSX.utils.book_append_sheet(workbook, worksheet, "Rate Capability Detail");

            // 엑셀 바이너리 파일 데이터 생성
            const wbout = XLSX.write(workbook, { bookType: 'xlsx', type: 'array' });
            
            // 응답 콘텐츠 타입에 상응하는 엑셀 바이너리 Blob 객체 생성
            const blob = new Blob([wbout], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
            
            // 오늘 날짜 포맷 (YYYYMMDD) 생성
            const today = new Date();
            const yyyy = today.getFullYear();
            const mm = String(today.getMonth() + 1).padStart(2, '0');
            const dd = String(today.getDate()).padStart(2, '0');
            const formattedDate = `${yyyy}${mm}${dd}`;

            // a 태그를 생성하여 download 속성을 명시한 후 강제 클릭 유도 (한글명 인코딩 유지)
            const url = URL.createObjectURL(blob);
            const link = document.createElement("a");
            link.href = url;
            link.download = `상세용량_분석결과_${formattedDate}.xlsx`;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            URL.revokeObjectURL(url);
        });
    }
}

function downloadChartImage(chartInstance, filename) {
    if (!chartInstance) return;
    const link = document.createElement('a');
    link.download = `${filename}.png`;
    link.href = chartInstance.toBase64Image();
    link.click();
}

/**
 * 방향 조건에 따른 엑셀 열 헤더 배열을 반환합니다.
 */
function getProfileExportHeaders(direction) {
    if (direction === 'all') {
        return [
            "Dataset", 
            "Cycle", 
            "Point Index", 
            "Discharge Capacity (mAh/g)", 
            "Discharge Voltage (V vs. Na/Na+)", 
            "Charge Capacity (mAh/g)", 
            "Charge Voltage (V vs. Na/Na+)"
        ];
    } else if (direction === 'discharge') {
        return [
            "Dataset", 
            "Cycle", 
            "Point Index", 
            "Discharge Capacity (mAh/g)", 
            "Discharge Voltage (V vs. Na/Na+)"
        ];
    } else {
        return [
            "Dataset", 
            "Cycle", 
            "Point Index", 
            "Charge Capacity (mAh/g)", 
            "Charge Voltage (V vs. Na/Na+)"
        ];
    }
}

/**
 * 모든 대상 데이터셋들의 사이클 리스트의 Union(합집합)을 정렬된 배열로 반환합니다.
 */
function getProfileExportTargetCyclesUnion(displayDS, targetCycleVal) {
    if (targetCycleVal === 'all') {
        const union = new Set();
        displayDS.forEach(ds => {
            if (ds.processedCycles) {
                Object.keys(ds.processedCycles).forEach(k => union.add(Number(k)));
            }
        });
        return Array.from(union).sort((a, b) => a - b);
    } else {
        return [parseInt(targetCycleVal)];
    }
}

/**
 * 특정 데이터셋의 한 사이클에 해당하는 충방전 와이드 포맷 행 데이터(2차원 배열, 헤더 제외)를 조립합니다.
 */
function buildProfileExportRowsForCycle(ds, cNum, direction, targetCycleVal) {
    if (!ds.processedCycles) return [];

    let actualCycleNum = cNum;

    if (targetCycleVal === 'all') {
        // 전체 사이클 다운로드 시에는 해당 데이터셋에 해당 사이클이 없으면 fallback 없이 skip
        if (!ds.processedCycles[cNum]) return [];
    } else {
        // 특정 단일 사이클 선택 시에 데이터셋에 없으면 가장 가까운 사이클 번호로 fallback
        const dsCycles = Object.keys(ds.processedCycles).map(Number).sort((a, b) => a - b);
        if (dsCycles.length === 0) return [];
        if (!dsCycles.includes(cNum)) {
            actualCycleNum = dsCycles.reduce((prev, curr) => Math.abs(curr - cNum) < Math.abs(prev - cNum) ? curr : prev);
        }
    }

    const cycleData = ds.processedCycles[actualCycleNum];
    if (!cycleData) return [];

    const sodiation = cycleData.sodiation || [];
    const desodiation = cycleData.desodiation || [];
    const dsName = ds.customName || ds.filename || "Unknown Dataset";
    const rows = [];

    if (direction === 'all') {
        const maxLen = Math.max(sodiation.length, desodiation.length);
        for (let i = 0; i < maxLen; i++) {
            const sodPt = sodiation[i];
            const desodPt = desodiation[i];
            rows.push([
                dsName,
                actualCycleNum,
                i + 1,
                sodPt ? sodPt.capacity : "",
                sodPt ? sodPt.voltage : "",
                desodPt ? desodPt.capacity : "",
                desodPt ? desodPt.voltage : ""
            ]);
        }
    } else if (direction === 'discharge') {
        sodiation.forEach((pt, idx) => {
            rows.push([
                dsName,
                actualCycleNum,
                idx + 1,
                pt.capacity,
                pt.voltage
            ]);
        });
    } else if (direction === 'charge') {
        desodiation.forEach((pt, idx) => {
            rows.push([
                dsName,
                actualCycleNum,
                idx + 1,
                pt.capacity,
                pt.voltage
            ]);
        });
    }
    return rows;
}

/**
 * 전압 프로파일의 현재 표시 조건 그대로 XLSX 데이터로 빌드하고 내보냅니다.
 * (전체 사이클 선택 시 각 사이클별로 분할된 탭 시트를 동적으로 빌드합니다)
 */
async function exportVoltageProfileDataToExcel() {
    if (!hasActiveDataset()) return;

    const checkedDS = getCheckedDatasets();
    const isCompareMode = checkedDS.length >= 2;
    
    const displayDS = isCompareMode ? checkedDS : datasetLibrary.filter(d => d.id === activeDatasetId);
    if (displayDS.length === 0) {
        alert("내보낼 데이터가 없습니다.");
        return;
    }

    const direction = targetDirectionProfile ? targetDirectionProfile.value : 'all';

    // 버튼 UI 상태 로딩으로 변경 및 비활성화
    const originalContent = btnDownloadProfileExcel.innerHTML;
    btnDownloadProfileExcel.disabled = true;
    btnDownloadProfileExcel.innerHTML = '<span class="material-icons-round">hourglass_empty</span> 생성 중...';

    try {
        const headers = getProfileExportHeaders(direction);
        
        let targetCycles = [];
        if (isProfileCycleAll) {
            targetCycles = getProfileExportTargetCyclesUnion(displayDS, 'all');
        } else {
            targetCycles = [...selectedProfileCycles];
        }

        const workbook = XLSX.utils.book_new();
        let hasAnyData = false;

        // 사이클 루프 돌며 각각 독립된 시트 추가
        for (const cNum of targetCycles) {
            const sheetData = [headers];
            let sheetRowsCount = 0;

            displayDS.forEach(ds => {
                // isProfileCycleAll 이 true이면 'all'을 넘겨서 fallback 미적용, 아니면 'multi'를 넘겨서 fallback 미적용 (다중 선택 상태이므로)
                // selectedProfileCycles의 길이가 1일 때만 fallback을 허용하도록 buildProfileExportRowsForCycle 내부 조건 변경 예정
                const fallbackMode = (selectedProfileCycles.length === 1 && !isProfileCycleAll) ? 'single' : 'multi';
                const rows = buildProfileExportRowsForCycle(ds, cNum, direction, fallbackMode === 'single' ? cNum.toString() : 'all');
                if (rows.length > 0) {
                    rows.forEach(r => sheetData.push(r));
                    sheetRowsCount += rows.length;
                }
            });

            if (sheetRowsCount > 0) {
                hasAnyData = true;
                const worksheet = XLSX.utils.aoa_to_sheet(sheetData);
                
                // 시트 이름 결정 (Excel 31자 제한 및 특수 문자 필터링)
                let sheetName = `Cycle_${cNum}`;
                sheetName = sheetName.replace(/[\/\\?*\[\]:]/g, '_').substring(0, 31);
                
                XLSX.utils.book_append_sheet(workbook, worksheet, sheetName);
            }

            // 대용량 양보 비동기 yield
            await new Promise(resolve => setTimeout(resolve, 0));
        }

        if (!hasAnyData) {
            alert("내보낼 데이터가 없습니다.");
            return;
        }

        // 용량 절감 및 원활한 전송을 위해 compression: true 적용
        const wbout = XLSX.write(workbook, { bookType: 'xlsx', type: 'array', compression: true });
        const blob = new Blob([wbout], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });

        // 시간 포맷 (YYYYMMDD_HHMMSS)
        const now = new Date();
        const yyyy = now.getFullYear();
        const mm = String(now.getMonth() + 1).padStart(2, '0');
        const dd = String(now.getDate()).padStart(2, '0');
        const hh = String(now.getHours()).padStart(2, '0');
        const min = String(now.getMinutes()).padStart(2, '0');
        const ss = String(now.getSeconds()).padStart(2, '0');
        const formattedTime = `${yyyy}${mm}${dd}_${hh}${min}${ss}`;

        const cycleStr = isProfileCycleAll ? 'all' : `cycles_${selectedProfileCycles.join('_')}`;
        const filename = `전압프로파일_${cycleStr}_${direction}_${formattedTime}.xlsx`;

        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = url;
        link.download = filename;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);

    } catch (err) {
        console.error("전압 프로파일 엑셀 내보내기 에러:", err);
        alert("엑셀 파일 내보내기 중 오류가 발생했습니다.");
    } finally {
        // 버튼 원래 형태대로 복구
        btnDownloadProfileExcel.disabled = false;
        btnDownloadProfileExcel.innerHTML = originalContent;
    }
}



/* ============================================================
   GITT 분석 연산, 이벤트 바인딩 및 시각화 엔진
   ============================================================ */
/* ============================================================
   메인 분석 모드 (일반 성능 분석 전용 stub) 제어
   ============================================================ */
function setAnalysisMode(mode = 'general') {
    currentAnalysisMode = 'general';
    isGittMode = false;
    
    if (rateConfigPanel) rateConfigPanel.style.display = 'block';
    
    const gittConfigPanel = document.getElementById('gittConfigPanel');
    if (gittConfigPanel) gittConfigPanel.style.display = 'none';
    
    renderDatasetLibraryUI();
}

// 전압 프로파일 사이클 칩 드래그 및 범위 선택 상태 제어 변수
let lastClickedProfileCycleIdx = -1;
let isProfileDragSelecting = false;
let profileDragMode = 'select';

// 드래그 해제 글로벌 리스너 등록
document.addEventListener('pointerup', () => {
    if (isProfileDragSelecting) {
        isProfileDragSelecting = false;
        document.body.classList.remove('drag-select-active');
        // 마우스 드래그가 끝난 시점에 한 번에 드로잉 렌더링을 적용하여 대단히 쾌적하게 렉을 방지함
        updateProfileCycleSummary();
        updateProfileView();
    }
});

/**
 * 전압 프로파일 탭 내 다중 사이클 선택 칩 목록을 렌더링하고 이벤트를 바인딩합니다.
 * (드래그 연속 선택 및 Shift 범위 토글 선택 인터랙션을 완벽하게 구현합니다)
 */
function renderProfileCycleChipsUI() {
    if (!profileCycleChipsContainer) return;
    profileCycleChipsContainer.innerHTML = '';

    const cycles = getProfileAvailableCycles();
    if (cycles.length === 0) {
        profileCycleChipsContainer.innerHTML = '<span style="font-size:11px; color:var(--text-muted);">사이클 데이터가 없습니다.</span>';
        updateProfileCycleSummary();
        return;
    }

    // 상태 유효성 보정
    selectedProfileCycles = selectedProfileCycles.filter(c => cycles.includes(c));
    if (selectedProfileCycles.length === 0 && !isProfileCycleAll) {
        selectedProfileCycles = [cycles[0]];
    }

    // "전체" 퀵 버튼 상태 클래스 업데이트
    if (btnProfileCycleAll) {
        if (isProfileCycleAll) {
            btnProfileCycleAll.classList.add('active');
        } else {
            btnProfileCycleAll.classList.remove('active');
        }
    }

    cycles.forEach((cNum, idx) => {
        const chip = document.createElement('div');
        const isActive = !isProfileCycleAll && selectedProfileCycles.includes(cNum);
        chip.className = `cycle-chip${isActive ? ' active' : ''}`;
        chip.textContent = `${cNum}C`;
        chip.title = `${cNum} Cycle`;

        // 드래그 중 텍스트 선택 파란 블록 방지
        chip.style.userSelect = 'none';

        // 1. Pointer Down (드래그 시작 및 Shift 키 분기)
        chip.addEventListener('pointerdown', (e) => {
            chip.releasePointerCapture(e.pointerId); // 브라우저 자체 드래그 캡처 버그 우회
            isProfileCycleAll = false;

            // Shift+클릭 범위 일괄 선택 구현
            if (e.shiftKey && lastClickedProfileCycleIdx !== -1) {
                const startIdx = Math.min(lastClickedProfileCycleIdx, idx);
                const endIdx = Math.max(lastClickedProfileCycleIdx, idx);
                
                for (let i = startIdx; i <= endIdx; i++) {
                    const targetCNum = cycles[i];
                    if (!selectedProfileCycles.includes(targetCNum)) {
                        selectedProfileCycles.push(targetCNum);
                    }
                }
                selectedProfileCycles.sort((a, b) => a - b);
                lastClickedProfileCycleIdx = idx;

                renderProfileCycleChipsUI();
                updateProfileCycleSummary();
                updateProfileView();
                return;
            }

            // 일반 드래그 선택 모드 결정
            isProfileDragSelecting = true;
            profileDragMode = isActive ? 'deselect' : 'select';
            document.body.classList.add('drag-select-active');

            // 토글 선택 기동
            toggleCycleSelection(cNum, cycles);
            lastClickedProfileCycleIdx = idx;

            renderProfileCycleChipsUI();
            updateProfileCycleSummary();
            // 단일 클릭에서도 즉시 차트 갱신 (pointerup에만 의존하면 누락 가능)
            updateProfileView();
        });

        // 2. Pointer Enter (마우스 드래그 중인 상태로 다른 칩에 진입 시 연속 조작)
        chip.addEventListener('pointerenter', (e) => {
            // 마우스 버튼 미누름 상태이면 드래그가 아님 (단순 호버) → 즉시 종료
            if (e.buttons !== 1) return;
            if (!isProfileDragSelecting) return;

            if (profileDragMode === 'select') {
                if (!selectedProfileCycles.includes(cNum)) {
                    selectedProfileCycles.push(cNum);
                    selectedProfileCycles.sort((a, b) => a - b);
                }
            } else {
                // deselect 모드: 단 하나 남았을 때는 완전히 지워지는 것 방어
                if (selectedProfileCycles.length > 1) {
                    const index = selectedProfileCycles.indexOf(cNum);
                    if (index > -1) {
                        selectedProfileCycles.splice(index, 1);
                    }
                }
            }

            renderProfileCycleChipsUI();
            updateProfileCycleSummary();
        });

        profileCycleChipsContainer.appendChild(chip);
    });

    // 상단 캡션 텍스트 갱신
    updateProfileCycleSummary();
}

/**
 * 칩 단위 토글 선택 유틸리티 (최소 1개 선택 보호막 작동)
 */
function toggleCycleSelection(cNum, cycles) {
    const index = selectedProfileCycles.indexOf(cNum);
    if (index > -1) {
        if (selectedProfileCycles.length > 1) {
            selectedProfileCycles.splice(index, 1);
        }
    } else {
        selectedProfileCycles.push(cNum);
        selectedProfileCycles.sort((a, b) => a - b);
    }
}

/**
 * 사이클 요약 버튼/텍스트 라벨을 선택 상태에 맞게 실시간 갱신합니다.
 */
function updateProfileCycleSummary() {
    const summarySpan = document.getElementById('profileCycleSummary');
    if (!summarySpan) return;

    if (isProfileCycleAll) {
        summarySpan.textContent = "전체 사이클";
        return;
    }

    const len = selectedProfileCycles.length;
    if (len === 0) {
        summarySpan.textContent = "선택 없음";
        return;
    }

    if (len === 1) {
        summarySpan.textContent = `${selectedProfileCycles[0]} Cycle`;
    } else if (len <= 3) {
        summarySpan.textContent = `${selectedProfileCycles.join(', ')} Cycle (${len}개)`;
    } else {
        summarySpan.textContent = `${selectedProfileCycles.slice(0, 3).join(', ')} 외 ${len - 3}개`;
    }
}

/**
 * 전압 프로파일용 가용 사이클 리스트 합집합 추출 헬퍼 함수
 */
function getProfileAvailableCycles() {
    const checkedDS = getCheckedDatasets();
    const isCompareMode = checkedDS.length >= 2;
    const displayDS = isCompareMode ? checkedDS : datasetLibrary.filter(d => d.id === activeDatasetId);
    
    const union = new Set();
    displayDS.forEach(ds => {
        if (ds.processedCycles) {
            Object.keys(ds.processedCycles).forEach(k => union.add(Number(k)));
        }
    });
    return Array.from(union).sort((a, b) => a - b);
}

/**
 * 전압 프로파일용 뷰/차트 갱신 트리거
 */
function updateProfileView() {
    if (hasActiveDataset()) {
        runAnalysis();
    }
}

/**
 * 전압 프로파일 퀵 버튼 액션 필터 바인딩
 */
function initProfileCycleQuickActions() {
    // 1. 드롭다운 토글 버튼 클릭 처리 (ID 기반으로 확실하게 탐색)
    const toggleBtn = document.getElementById('btnProfileCycleDropdown');
    const panel = document.getElementById('profileCycleDropdownPanel');
    const container = toggleBtn ? toggleBtn.closest('.profile-dropdown-container') : null;
    
    if (toggleBtn && container) {
        toggleBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            const isOpen = container.classList.contains('open');
            container.classList.toggle('open', !isOpen);
        });
    }

    // 2. 바깥 영역 클릭 시 드롭다운 닫기 (Outside Click)
    document.addEventListener('click', (e) => {
        if (container && container.classList.contains('open')) {
            if (!container.contains(e.target)) {
                container.classList.remove('open');
            }
        }
    });

    if (btnProfileCycleAll) {
        btnProfileCycleAll.onclick = () => {
            isProfileCycleAll = true;
            selectedProfileCycles = [];
            
            if (targetCycleSelect) {
                targetCycleSelect.value = 'all';
            }
            
            renderProfileCycleChipsUI();
            updateProfileView();
        };
    }

    if (btnProfileCycleClear) {
        btnProfileCycleClear.onclick = () => {
            isProfileCycleAll = false;
            const cycles = getProfileAvailableCycles();
            if (cycles.length > 0) {
                selectedProfileCycles = [cycles[0]];
                
                if (targetCycleSelect) {
                    targetCycleSelect.value = cycles[0].toString();
                }
            }
            renderProfileCycleChipsUI();
            updateProfileView();
        };
    }

    if (btnProfileCycleOdd) {
        btnProfileCycleOdd.onclick = () => {
            isProfileCycleAll = false;
            const cycles = getProfileAvailableCycles();
            selectedProfileCycles = cycles.filter(c => c % 2 !== 0);
            if (selectedProfileCycles.length === 0 && cycles.length > 0) {
                selectedProfileCycles = [cycles[0]];
            }
            
            if (targetCycleSelect && selectedProfileCycles.length > 0) {
                targetCycleSelect.value = selectedProfileCycles[0].toString();
            }
            
            renderProfileCycleChipsUI();
            updateProfileView();
        };
    }

    if (btnProfileCycleEven) {
        btnProfileCycleEven.onclick = () => {
            isProfileCycleAll = false;
            const cycles = getProfileAvailableCycles();
            selectedProfileCycles = cycles.filter(c => c % 2 === 0);
            if (selectedProfileCycles.length === 0 && cycles.length > 0) {
                selectedProfileCycles = [cycles[0]];
            }
            
            if (targetCycleSelect && selectedProfileCycles.length > 0) {
                targetCycleSelect.value = selectedProfileCycles[0].toString();
            }
            
            renderProfileCycleChipsUI();
            updateProfileView();
        };
    }
}

