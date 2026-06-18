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

// ============================================================
// 멀티 데이터셋 라이브러리 전역 상태
// ============================================================
let datasetLibrary = []; // 저장된 데이터셋 목록
let activeDatasetId = null; // 현재 단일 분석 중인 데이터셋 ID
let _pendingParsedData = null; // 모달 열기 전 임시 보관 (parseData → modal → finalize 흐름)
let _pendingFilename = ''; // 모달에 표시할 파일명 임시 보관

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

// Charts Instances
let chartProfileInstance = null;
let chartSlopePlateauInstance = null;
let chartRateCyclesInstance = null;
let chartRateSummaryInstance = null;
let chartDqDvInstance = null;

// DOM Elements
const dropZone = document.getElementById('dropZone');
const fileInput = document.getElementById('fileInput');
const btnDemoData = document.getElementById('btnDemoData');
const btnGittDemoData = document.getElementById('btnGittDemoData');
const btnWelcomeDemo = document.getElementById('btnWelcomeDemo');
const btnWelcomeDemo2 = document.getElementById('btnWelcomeDemo');
const configCard = document.getElementById('configCard');
const welcomeView = document.getElementById('welcomeView');
const activeFilename = document.getElementById('activeFilename');

// Select elements for column mapping
const mapCycle = document.getElementById('mapCycle');
const mapVoltage = document.getElementById('mapVoltage');
const mapCapacity = document.getElementById('mapCapacity');
const mapCurrent = document.getElementById('mapCurrent');

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

// GITT State & Charts
let isGittMode = false;
let gittRawData = [];
let gittResults = [];
let gittDischargeRuns = []; // [{ runIndex: 1, rawData: [...], results: [...] }]
let gittChargeRuns = [];    // [{ runIndex: 1, rawData: [...], results: [...] }]
let activeGittDischargeRunIdx = 0;
let activeGittChargeRunIdx = 0;

// 메인 모드 상태 및 DOM 엘리먼트 정의
let currentAnalysisMode = 'general'; // 'general' or 'gitt'
const btnModeGeneral = document.getElementById('btnModeGeneral');
const btnModeGitt = document.getElementById('btnModeGitt');
const rateConfigPanel = document.getElementById('rateConfigPanel');
const welcomeIcon = document.getElementById('welcomeIcon');
const welcomeTitle = document.getElementById('welcomeTitle');
const welcomeDesc = document.getElementById('welcomeDesc');
const welcomeDemoBtnIcon = document.getElementById('welcomeDemoBtnIcon');
const welcomeDemoBtnText = document.getElementById('welcomeDemoBtnText');

let chartGittProfileInstance = null;
let chartGittProfileCapacityInstance = null;
let chartGittDiffusionInstance = null;

// GITT DOM Elements
const gittConfigPanel = document.getElementById('gittConfigPanel');
const gittMassInput = document.getElementById('gittMass');
const gittAreaInput = document.getElementById('gittArea');
const gittVolInput = document.getElementById('gittVol');
const gittMolarMassInput = document.getElementById('gittMolarMass');
const gittShowModeSelect = document.getElementById('gittShowMode');
const tableGittSummaryBody = document.querySelector('#tableGittSummary tbody');
const btnExportGittCsv = document.getElementById('btnExportGittCsv');
const btnCalculateGittDiffusion = document.getElementById('btnCalculateGittDiffusion');
const gittCalcResultsArea = document.getElementById('gittCalcResultsArea');
const gittDischargeCycleSelect = document.getElementById('gittDischargeCycle');
const gittChargeCycleSelect = document.getElementById('gittChargeCycle');



// Export Buttons
const btnDownloadProfile = document.getElementById('btnDownloadProfile');
const btnDownloadSlopeChart = document.getElementById('btnDownloadSlopeChart');
const btnDownloadRateData = document.getElementById('btnDownloadRateData');

// Tables
const tableSlopePlateau = document.getElementById('tableSlopePlateau');
const tableRateSummary = document.getElementById('tableRateSummary');
const tableDqDvPeaks = document.getElementById('tableDqDvPeaks');

// Tab Selection
const tabButtons = document.querySelectorAll('.tab-btn');
const tabPanels = document.querySelectorAll('.tab-panel');

/* ==========================================
   1. Event Listeners & Initialization
   ========================================== */
document.addEventListener('DOMContentLoaded', async () => {
    initAnalysisModes(); // 메인 분석 모드(일반 vs GITT) 전환 및 상태 초기화
    initTabs();
    initFileUpload();
    initAnalysisControls();
    initExportFeatures();
    initRateToggle(); // C-rate 모드 전환 이벤트 초기화
    initDatasetLibrary(); // 데이터셋 라이브러리 이벤트 초기화
    initGittEvents(); // GITT 이벤트 및 입력값 연동 초기화

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
            // 저장된 기존 데이터가 없을 때는 웰컴 화면을 노출하지 않고 기본 대시보드 상태 유지
            if (welcomeView) welcomeView.style.display = 'none';
        }
    } catch (err) {
        console.error("초기 데이터셋 로드 오류:", err);
        if (welcomeView) welcomeView.style.display = 'none';
    }
});

// Tab Switching Logic
function initTabs() {
    tabButtons.forEach(btn => {
        btn.addEventListener('click', () => {
            if (rawBatteryData.length === 0) return; // No data loaded
            
            tabButtons.forEach(b => b.classList.remove('active'));
            tabPanels.forEach(p => p.classList.remove('active'));
            
            btn.classList.add('active');
            const tabId = btn.getAttribute('data-tab');
            document.getElementById(tabId).classList.add('active');
            
            // Re-render chart on tab display to fix sizing issues
            setTimeout(() => {
                triggerChartResize();
                if (tabId === 'tab-dqdv') {
                    updateDqDvView();
                } else if (tabId === 'tab-gitt' && isGittMode) {
                    runGittAnalysis();
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
    if (chartGittProfileInstance) chartGittProfileInstance.resize();
    if (chartGittProfileCapacityInstance) chartGittProfileCapacityInstance.resize();
    if (chartGittDiffusionInstance) chartGittDiffusionInstance.resize();
}

// File Upload Drag & Drop & Input
function initFileUpload() {
    // Drag/Drop visual states
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
            const files = e.dataTransfer.files;
            if (files.length > 0) {
                handleFile(files[0]);
            }
        });
        
        dropZone.addEventListener('click', () => {
            if (fileInput) fileInput.click();
        });
    }
    
    if (fileInput) {
        fileInput.addEventListener('change', (e) => {
            const files = e.target.files;
            if (files.length > 0) {
                handleFile(files[0]);
            }
        });
    }
}

// Reads raw file data (Supports XLSX / CSV / TXT)
// Reads Excel file and parses it using SheetJS (XLSX)
function parseExcelFile(file) {
    const reader = new FileReader();
    reader.onload = (e) => {
        try {
            const data = e.target.result;
            const workbook = XLSX.read(data, { type: 'array' });
            
            let targetSheetName = null;
            let targetJsonData = null;
            
            // 시트명 중 'data', 'raw', 'gitt', 'sheet', 'test'가 들어간 시트를 선호
            const preferredSheets = workbook.SheetNames.filter(name => {
                const lower = name.toLowerCase();
                return lower.includes('data') || lower.includes('raw') || lower.includes('gitt') || lower.includes('sheet1') || lower.includes('test');
            });
            
            const searchOrder = [...preferredSheets, ...workbook.SheetNames.filter(name => !preferredSheets.includes(name))];
            
            for (const sheetName of searchOrder) {
                const worksheet = workbook.Sheets[sheetName];
                if (!worksheet) continue;
                const jsonData = XLSX.utils.sheet_to_json(worksheet, { header: 1 });
                if (!jsonData || jsonData.length < 2) continue;
                
                if (checkHasHeaders(jsonData)) {
                    targetSheetName = sheetName;
                    targetJsonData = jsonData;
                    break;
                }
            }
            
            // 유효한 헤더를 찾지 못한 경우 첫 번째 시트 사용
            if (!targetJsonData) {
                targetSheetName = workbook.SheetNames[0];
                targetJsonData = XLSX.utils.sheet_to_json(workbook.Sheets[targetSheetName], { header: 1 });
            }
            
            console.log(`자동 시트 감지 완료. 선택된 시트: ${targetSheetName}`);
            parseExcelData(targetJsonData, file.name);
        } catch (error) {
            console.error("Excel parsing error:", error);
            alert("엑셀 파일 파싱 중 오류가 발생했습니다: " + error.message);
            activeFilename.textContent = "분석할 데이터를 업로드해 주세요";
        }
    };
    reader.onerror = () => {
        alert("엑셀 파일을 읽는 도중 오류가 발생했습니다.");
    };
    reader.readAsArrayBuffer(file);
}

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

function handleFile(file) {
    const filename = file.name;
    const extension = filename.split('.').pop().toLowerCase();
    
    activeFilename.textContent = `로드 중: ${filename}...`;
    welcomeView.style.display = 'none';
    
    if (extension === 'xlsx' || extension === 'xls') {
        parseExcelFile(file);
    } else {
        readTextFile(file);
    }
}

function readTextFile(file, encoding = 'UTF-8') {
    const reader = new FileReader();
    reader.onload = (e) => {
        const text = e.target.result;
        const success = parseRawText(text, file.name, encoding);
        if (!success) {
            if (encoding === 'UTF-8') {
                console.log("UTF-8 파싱 실패, EUC-KR 인코딩으로 재시도합니다.");
                readTextFile(file, 'EUC-KR');
            } else {
                alert("파일 분석에 실패했습니다. '전압' 및 '용량' 열이 포함되어 있는지, 혹은 파일 형식이 올바른지 확인해 주십시오.");
                activeFilename.textContent = "분석할 데이터를 업로드해 주세요";
            }
        }
    };
    reader.onerror = () => {
        alert("파일 읽기 도중 오류가 발생했습니다.");
    };
    reader.readAsText(file, encoding);
}

// Analysis UI control updates
function initAnalysisControls() {
    cutoffVoltageInput.addEventListener('input', (e) => {
        const val = parseFloat(e.target.value).toFixed(2);
        cutoffValDisplay.textContent = `${val} V`;
        if (rawBatteryData.length > 0) {
            runAnalysis();
        }
    });

    targetCycleSelect.addEventListener('change', () => {
        const val = targetCycleSelect.value;
        const cycleNumbers = Object.keys(processedCycles).map(Number).sort((a, b) => a - b);
        const firstCyc = (cycleNumbers[0] || '1').toString();
        
        if (targetCycleSelectSP) {
            targetCycleSelectSP.value = val === 'all' ? firstCyc : val;
        }
        if (targetCycleDqDv) {
            if (val !== 'all') {
                targetCycleDqDv.value = val;
                const cNum = parseInt(val);
                if (!isNaN(cNum)) {
                    selectedDqDvCycles = [cNum];
                }
            } else {
                const prevVal = targetCycleDqDv.value;
                if (!prevVal || isNaN(parseInt(prevVal))) {
                    targetCycleDqDv.value = firstCyc;
                    selectedDqDvCycles = [parseInt(firstCyc) || 1];
                }
            }
            renderCycleChipsUI();
        }
        if (rawBatteryData.length > 0) {
            runAnalysis();
            updateDqDvView();
        }
    });

    if (targetCycleSelectSP) {
        targetCycleSelectSP.addEventListener('change', () => {
            const val = targetCycleSelectSP.value;
            targetCycleSelect.value = val;
            if (targetCycleDqDv) {
                targetCycleDqDv.value = val;
                const cNum = parseInt(val);
                if (!isNaN(cNum)) {
                    selectedDqDvCycles = [cNum];
                    renderCycleChipsUI();
                }
            }
            if (rawBatteryData.length > 0) {
                runAnalysis();
                updateDqDvView();
            }
        });
    }

    if (targetCycleDqDv) {
        targetCycleDqDv.addEventListener('change', () => {
            const val = targetCycleDqDv.value;
            targetCycleSelect.value = val;
            if (targetCycleSelectSP) {
                targetCycleSelectSP.value = val;
            }
            const cNum = parseInt(val);
            if (!isNaN(cNum) && !selectedDqDvCycles.includes(cNum)) {
                selectedDqDvCycles = [cNum];
                renderCycleChipsUI();
            }
            if (rawBatteryData.length > 0) {
                runAnalysis();
                updateDqDvView();
            }
        });
    }

    // 다중 사이클 퀵 필터 바인딩
    initCycleQuickActions();

    if (selectDqDvMode) {
        selectDqDvMode.addEventListener('change', () => {
            if (rawBatteryData.length > 0) {
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
            if (rawBatteryData.length > 0) {
                updateDqDvView();
            }
        });
    }

    if (dqdvQo) {
        dqdvQo.addEventListener('input', () => {
            if (rawBatteryData.length > 0) {
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
            if (rawBatteryData.length > 0) {
                updateDqDvView();
            }
        });
    }

    if (dqdvPostAvg) {
        dqdvPostAvg.addEventListener('input', () => {
            if (rawBatteryData.length > 0) {
                updateDqDvView();
            }
        });
    }

    // Handle manual column mapping changes
    const mapSelects = [mapCycle, mapVoltage, mapCapacity, mapCurrent];
    mapSelects.forEach((select, index) => {
        select.addEventListener('change', () => {
            const key = ['cycle', 'voltage', 'capacity', 'current'][index];
            mappedColumns[key] = parseInt(select.value);
            if (rawBatteryData.length > 0) {
                processData();
                runAnalysis();
            }
        });
    });

    // C-rate 분석 단위 설정 변경 리스너
    const rateStepSizeSelect = document.getElementById('rateStepSize');
    if (rateStepSizeSelect) {
        rateStepSizeSelect.addEventListener('change', () => {
            if (rawBatteryData.length > 0) {
                runAnalysis();
            }
        });
    }

    // 율속 단계 라벨 직접 입력 변경 리스너
    const rateStepsInput = document.getElementById('rateStepsInput');
    if (rateStepsInput) {
        rateStepsInput.addEventListener('change', () => {
            if (rawBatteryData.length > 0) {
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

            if (rawBatteryData.length > 0) {
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
    
    if (rawBatteryData.length > 0) {
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
    const nameInput = document.getElementById('datasetNameInput');

    if (btnSave) {
        btnSave.addEventListener('click', () => {
            const customName = (nameInput ? nameInput.value.trim() : '') || _pendingFilename;
            finalizeDatasetSave(customName);
        });
    }

    if (btnSkip) {
        btnSkip.addEventListener('click', () => {
            // 건너뛰기: 파일명을 이름으로 사용해 저장
            finalizeDatasetSave(_pendingFilename);
        });
    }

    // Enter 키로도 저장 가능
    if (nameInput) {
        nameInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                const customName = nameInput.value.trim() || _pendingFilename;
                finalizeDatasetSave(customName);
            }
        });
    }

    // 모달 바깥 영역 클릭 시 건너뛰기
    if (modal) {
        modal.addEventListener('click', (e) => {
            if (e.target === modal) {
                finalizeDatasetSave(_pendingFilename);
            }
        });
    }
}

/**
 * 파싱 완료 후 데이터셋 이름 입력 모달을 표시합니다.
 * processData()가 이미 호출된 상태여야 합니다 (processedCycles가 채워진 상태).
 */
function showDatasetNameModal(filename) {
    _pendingFilename = filename;

    const modal     = document.getElementById('datasetNameModal');
    const nameInput = document.getElementById('datasetNameInput');
    const fnLabel   = document.getElementById('modalFilename');

    if (fnLabel) fnLabel.textContent = filename;

    // 기본 이름: 파일명에서 확장자 제거
    const defaultName = filename.replace(/\.[^.]+$/, '');
    if (nameInput) {
        nameInput.value = defaultName;
        // 모달 열릴 때 자동 포커스 및 전체 선택
        setTimeout(() => { nameInput.select(); nameInput.focus(); }, 100);
    }

    if (modal) modal.style.display = 'flex';
}

/**
 * 모달에서 이름 확정 후 라이브러리에 저장하고 runAnalysis 호출
 */
async function finalizeDatasetSave(customName) {
    const modal = document.getElementById('datasetNameModal');
    if (modal) modal.style.display = 'none';

    // 색상 배정 (순환)
    const colorIdx = datasetLibrary.length % DATASET_COLORS.length;
    const color = DATASET_COLORS[colorIdx];
    const id = Date.now().toString();

    let dataset;
    if (isGittMode) {
        dataset = {
            id,
            customName: customName || _pendingFilename,
            filename: _pendingFilename,
            uploadedAt: new Date().toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' }),
            isGitt: true,
            gittRawData: JSON.parse(JSON.stringify(gittRawData)),
            gittResults: JSON.parse(JSON.stringify(gittResults)),
            color,
            compareEnabled: false,
            gittParams: {
                mass: parseFloat(gittMassInput.value) || 1.033,
                area: parseFloat(gittAreaInput.value) || 1.54,
                vol: parseFloat(gittVolInput.value) || 9.38,
                molarMass: parseFloat(gittMolarMassInput.value) || 12.011
            }
        };
    } else {
        // 현재 processedCycles를 딥카피하여 저장 (이후 업로드로 덮어쓰여도 보존)
        const savedCycles = JSON.parse(JSON.stringify(processedCycles));
        
        // DB 저장 용량 최소화 및 전송 속도 향상을 위해 사용되지 않는 대용량 중간 적재 필드 소거
        for (const cycleNum in savedCycles) {
            const cyc = savedCycles[cycleNum];
            if (cyc) {
                delete cyc.all;
                delete cyc.rawSodiation;
                delete cyc.rawDesodiation;
            }
        }
        
        const totalCycles = Object.keys(savedCycles).length;

        // ICE 계산 (1번 사이클 기준)
        const firstCyc = savedCycles[1];
        const ice = firstCyc && firstCyc.totalDischargeCap > 0
            ? ((firstCyc.totalChargeCap / firstCyc.totalDischargeCap) * 100).toFixed(1)
            : '-';

        dataset = {
            id,
            customName: customName || _pendingFilename,
            filename: _pendingFilename,
            uploadedAt: new Date().toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' }),
            processedCycles: savedCycles,
            totalCycles,
            ice,
            color,
            compareEnabled: true,  // 비교 오버레이 체크 여부
            selectedCycle: 1,        // 이 데이터셋에서 사용할 비교 사이클 번호
            mass: dqdvMass ? parseFloat(dqdvMass.value) || 2.58 : 2.58
        };
    }

    datasetLibrary.push(dataset);
    activeDatasetId = id;

    // 헤더 파일명 업데이트
    activeFilename.textContent = dataset.customName;

    // 라이브러리 UI 갱신
    renderDatasetLibraryUI();

    // DB에 비동기 저장 (GITT는 rawData 크기가 크므로 저장 시도만)
    try {
        await saveDatasetToDB(dataset);
    } catch (e) {
        console.warn('DB 저장 실패 (용량 초과 가능성):', e);
    }

    // 분석 실행
    runAnalysis();
}

/**
 * 특정 데이터셋을 현재 단일 분석 대상으로 전환합니다.
 */
function switchActiveDataset(id) {
    const ds = datasetLibrary.find(d => d.id === id);
    if (!ds) return;

    activeDatasetId = id;

    // 1. 메모리 전역 상태 데이터 로드
    if (ds.isGitt) {
        isGittMode = true;
        gittRawData = JSON.parse(JSON.stringify(ds.gittRawData));
        gittResults = JSON.parse(JSON.stringify(ds.gittResults));

        // 다중 회차 구조 복원/재구성
        splitGittRuns(gittRawData);

        // 파라미터 복원
        if (ds.gittParams) {
            gittMassInput.value = ds.gittParams.mass;
            gittAreaInput.value = ds.gittParams.area;
            gittVolInput.value = ds.gittParams.vol;
            gittMolarMassInput.value = ds.gittParams.molarMass;
        }

        activeFilename.textContent = ds.customName;
        document.querySelector('.header-info .badge').textContent = "LOADED";
        document.querySelector('.header-info .badge').className = "badge badge-info";

        // GITT 관련 결과 영역 제어
        if (gittResults && gittResults.length > 0 && gittResults[0].D !== undefined) {
            if (gittCalcResultsArea) gittCalcResultsArea.style.display = 'grid';
            calculateFinalGittDiffusion();
            renderGittDiffusionChart();
            updateGittSummaryTable();
        }
    } else {
        isGittMode = false;

        // 전역 processedCycles를 해당 데이터셋으로 교체
        processedCycles = JSON.parse(JSON.stringify(ds.processedCycles));
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
        renderCycleChipsUI();
    }

    // 2. 현재 모드가 로드된 데이터셋 종류와 일치하지 않으면 UI 및 모드 갱신
    const targetMode = ds.isGitt ? 'gitt' : 'general';
    if (currentAnalysisMode !== targetMode) {
        setAnalysisMode(targetMode);
    } else {
        // 이미 분석 모드가 일치하는 경우, 화면 탭과 그래프 갱신만 수행
        if (ds.isGitt) {
            // GITT 탭으로 강제 이동
            const gittTabBtn = document.querySelector('.tab-btn[data-tab="tab-gitt"]');
            if (gittTabBtn) {
                tabButtons.forEach(b => b.classList.remove('active'));
                tabPanels.forEach(p => p.classList.remove('active'));
                gittTabBtn.classList.add('active');
                document.getElementById('tab-gitt').classList.add('active');
            }
            runAnalysis();
        } else {
            // 일반 분석 탭에 머물러 있으면 해당 탭 갱신, 만약 GITT 탭에 있었다면 개요로 강제 복원
            const activeTabBtn = document.querySelector('.tab-btn.active');
            if (!activeTabBtn || activeTabBtn.getAttribute('data-tab') === 'tab-gitt') {
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
            gittRawData = [];
            gittResults = [];
            gittConfigPanel.style.display = 'none';
            configCard.style.display = 'block';
        }
    }

    renderDatasetLibraryUI();
    
    // DB에서 데이터셋 비동기 삭제
    await deleteDatasetFromDB(id);
    
    if (rawBatteryData.length > 0) runAnalysis();
}

/**
 * 현재 비교 오버레이에 체크된 데이터셋 목록을 반환합니다.
 * 단일 데이터셋만 있으면 기존 단일 렌더링 모드와 동일하게 동작합니다.
 */
function getCheckedDatasets() {
    return datasetLibrary.filter(d => d.compareEnabled);
}

/**
 * 사이드바 데이터 라이브러리 UI를 재렌더링합니다.
 */
function renderDatasetLibraryUI() {
    const listEl   = document.getElementById('datasetList');
    const countEl  = document.getElementById('libraryCountBadge');
    if (!listEl) return;

    // 현재 분석 모드에 부합하는 데이터셋만 필터링
    const filteredLibrary = datasetLibrary.filter(ds => 
        currentAnalysisMode === 'gitt' ? ds.isGitt === true : !ds.isGitt
    );

    if (countEl) countEl.textContent = filteredLibrary.length;

    if (filteredLibrary.length === 0) {
        listEl.innerHTML = `<p class="library-empty-msg">${currentAnalysisMode === 'gitt' ? '업로드한 GITT 데이터가 여기에 저장됩니다.' : '업로드한 일반 분석 데이터가 여기에 저장됩니다.'}</p>`;
        return;
    }

    listEl.innerHTML = '';

    filteredLibrary.forEach(ds => {
        const isActive = ds.id === activeDatasetId;
        const item = document.createElement('div');
        item.className = `dataset-item${isActive ? ' is-active' : ''}`;
        item.dataset.dsId = ds.id;

        let metaHtml = "";
        if (ds.isGitt) {
            metaHtml = `<span>${ds.filename} · GITT 분석 데이터</span>`;
        } else {
            metaHtml = `
                <span>${ds.filename} · ${ds.totalCycles} Cycles · ICE: ${ds.ice}%</span>
                <div class="ds-mass-container" style="display:inline-flex; align-items:center; gap:2px; font-size:10px;">
                    <span>Mass:</span>
                    <input type="number" class="ds-mass-input" data-ds-id="${ds.id}" value="${ds.mass !== undefined ? ds.mass : 2.58}" step="0.01" style="width:48px; background:rgba(255,255,255,0.07); border:1px solid rgba(255,255,255,0.15); color:#fff; border-radius:3px; padding:1px 3px; font-size:10px; text-align:center;">
                    <span>mg</span>
                </div>
            `;
        }

        item.innerHTML = `
            <div class="dataset-item-top">
                <input type="checkbox" class="ds-compare-checkbox" data-ds-id="${ds.id}"
                    ${ds.compareEnabled ? 'checked' : ''} ${ds.isGitt ? 'style="display:none;"' : ''} title="비교 오버레이에 포함">
                <span class="ds-color-dot" style="background:${ds.color}; color:${ds.color};"></span>
                <span class="ds-name" title="${ds.customName}">${ds.customName}</span>
                <button class="ds-rename-btn" data-ds-id="${ds.id}" title="이름 변경">✏️</button>
                ${isActive ? '<span class="ds-active-badge">분석중</span>' : ''}
                <button class="ds-delete-btn" data-ds-id="${ds.id}" title="삭제">×</button>
            </div>
            <div class="ds-meta" style="display:flex; align-items:center; justify-content:space-between; flex-wrap:wrap; gap:4px;">
                ${metaHtml}
            </div>
        `;

        // 아이템 클릭 → 활성 데이터셋 전환 (체크박스·삭제버튼은 제외)
        item.addEventListener('click', (e) => {
            if (e.target.closest('.ds-compare-checkbox') ||
                e.target.closest('.ds-delete-btn')) return;
            switchActiveDataset(ds.id);
        });

        // 체크박스 → 비교 오버레이 토글
        const cb = item.querySelector('.ds-compare-checkbox');
        cb.addEventListener('change', async (e) => {
            e.stopPropagation();
            ds.compareEnabled = e.target.checked;
            await updateDatasetInDB(ds);
            if (rawBatteryData.length > 0) runAnalysis();
        });

        // 삭제 버튼
        const delBtn = item.querySelector('.ds-delete-btn');
        delBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            removeDataset(ds.id);
        });

        // 이름 변경 버튼 (연필 아이콘)
        const renameBtn = item.querySelector('.ds-rename-btn');
        renameBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            const nameSpan = item.querySelector('.ds-name');
            const currentName = ds.customName;

            // 이미 편집 중이면 무시
            if (item.querySelector('.ds-rename-input')) return;

            // 이름 span → input 취환
            const input = document.createElement('input');
            input.type = 'text';
            input.value = currentName;
            input.className = 'ds-rename-input';
            nameSpan.replaceWith(input);
            renameBtn.style.display = 'none';
            input.focus();
            input.select();

            // 저장 액션 (이름 확정)
            const commitRename = async () => {
                const newName = input.value.trim();
                if (newName && newName !== currentName) {
                    ds.customName = newName;
                    // 현재 활성 데이터셋이면 헤더도 갱신
                    if (ds.id === activeDatasetId) {
                        activeFilename.textContent = newName;
                    }
                    // DB에도 이름 변경 내용 업데이트
                    await updateDatasetInDB(ds);
                }
                renderDatasetLibraryUI();
            };

            // 취소 액션
            const cancelRename = () => {
                renderDatasetLibraryUI();
            };

            input.addEventListener('keydown', (e) => {
                e.stopPropagation();
                if (e.key === 'Enter') commitRename();
                else if (e.key === 'Escape') cancelRename();
            });
            input.addEventListener('blur', commitRename);
            input.addEventListener('click', (e) => e.stopPropagation());
        });

        // 질량 입력 이벤트 리스너 추가
        const massInput = item.querySelector('.ds-mass-input');
        if (massInput) {
            massInput.addEventListener('click', (e) => e.stopPropagation()); // 아이템 클릭 이벤트 전파 차단
            massInput.addEventListener('change', async (e) => {
                const newMass = parseFloat(e.target.value);
                if (!isNaN(newMass) && newMass > 0) {
                    ds.mass = newMass;
                    // 활성 데이터셋의 질량인 경우 상단 글로벌 인풋도 함께 업데이트
                    if (ds.id === activeDatasetId && dqdvMass) {
                        dqdvMass.value = newMass;
                    }
                    await updateDatasetInDB(ds);
                    if (rawBatteryData.length > 0) {
                        runAnalysis();
                        updateDqDvView();
                    }
                }
            });
        }

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
function parseExcelData(jsonData, filename) {
    if (!jsonData || jsonData.length < 2) {
        alert("엑셀 데이터가 올바르지 않거나 비어 있습니다.");
        return;
    }

    // GITT 데이터 판정
    const isGittFile = filename.toLowerCase().includes('gitt') || 
                       jsonData.some(row => row && row.some(cell => typeof cell === 'string' && (cell.toLowerCase().includes('step no') || cell.toLowerCase().includes('test time'))));
    
    if (isGittFile) {
        if (currentAnalysisMode !== 'gitt') {
            setAnalysisMode('gitt');
        }
        parseGittExcelData(jsonData, filename);
        return;
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
        return;
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
        return;
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

    populateColumnSelectors();
    
    mapCycle.value = 0;
    mapVoltage.value = 1;
    mapCapacity.value = 2;
    mapCurrent.value = 3;

    configCard.classList.remove('disabled');

    processData(); // processedCycles 배열 구성
    // 데이터셋 이름 입력 모달을 통해 라이브러리에 저장 후 runAnalysis 호출
    showDatasetNameModal(filename);
}

/**
 * 텍스트 데이터(CSV, TSV, TXT 등)를 파싱하여 정규화 구조로 변환합니다.
 */
function parseRawText(text, filename, encoding = 'UTF-8') {
    const isGittText = filename.toLowerCase().includes('gitt') || text.toLowerCase().includes('step no') || text.toLowerCase().includes('test time');
    if (isGittText) {
        try {
            if (currentAnalysisMode !== 'gitt') {
                setAnalysisMode('gitt');
            }
            const workbook = XLSX.read(text, { type: 'string' });
            const firstSheetName = workbook.SheetNames[0];
            const worksheet = workbook.Sheets[firstSheetName];
            const jsonData = XLSX.utils.sheet_to_json(worksheet, { header: 1 });
            parseGittExcelData(jsonData, filename);
            return true;
        } catch (e) {
            console.error("GITT Text parsing via SheetJS failed:", e);
        }
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

    populateColumnSelectors();
    
    mapCycle.value = 0;
    mapVoltage.value = 1;
    mapCapacity.value = 2;
    mapCurrent.value = 3;

    configCard.classList.remove('disabled');

    processData(); // processedCycles 배열 구성
    // 데이터셋 이름 입력 모달을 통해 라이브러리에 저장 후 runAnalysis 호출
    showDatasetNameModal(filename);
    return true;
}

function populateColumnSelectors() {
    const selects = [mapCycle, mapVoltage, mapCapacity, mapCurrent];
    selects.forEach(select => {
        select.innerHTML = '';
        headerColumns.forEach((col, idx) => {
            const opt = document.createElement('option');
            opt.value = idx;
            opt.textContent = col;
            select.appendChild(opt);
        });
    });
}

function autoDetectColumns() {
    // Keywords for auto-matching
    const keywords = {
        cycle: ['cycle', '사이클', 'index', 'step', 'loop'],
        voltage: ['volt', '전압', 'voltage', 'v vs', 'potential'],
        capacity: ['cap', 'capacity', '용량', '비용량', 'specific cap', 'charge cap', 'discharge cap'],
        current: ['curr', '전류', 'current', 'i (', 'i_']
    };

    headerColumns.forEach((col, idx) => {
        const lowerCol = col.toLowerCase();
        for (const [key, words] of Object.entries(keywords)) {
            if (words.some(word => lowerCol.includes(word))) {
                if (mappedColumns[key] === -1 || lowerCol === key || lowerCol.includes('specific')) {
                    mappedColumns[key] = idx;
                }
            }
        }
    });

    // Set selectors values
    mapCycle.value = mappedColumns.cycle !== -1 ? mappedColumns.cycle : 0;
    mapVoltage.value = mappedColumns.voltage !== -1 ? mappedColumns.voltage : 1;
    mapCapacity.value = mappedColumns.capacity !== -1 ? mappedColumns.capacity : 2;
    mapCurrent.value = mappedColumns.current !== -1 ? mappedColumns.current : 3;

    // Apply back values in case auto-match failed
    mappedColumns.cycle = parseInt(mapCycle.value);
    mappedColumns.voltage = parseInt(mapVoltage.value);
    mappedColumns.capacity = parseInt(mapCapacity.value);
    mappedColumns.current = parseInt(mapCurrent.value);
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
}

/* ==========================================
   3. Electrochemical Analysis Calculations
   ========================================== */
function runAnalysis() {
    if (isGittMode) {
        runGittAnalysis();
        return;
    }
    const targetCycleVal = targetCycleSelect.value;
    
    if (targetCycleVal === 'all') {
        // 전체 사이클 모드 작동
        const cycleNumbers = Object.keys(processedCycles).map(Number).sort((a, b) => a - b);
        const lastCycNum = cycleNumbers[cycleNumbers.length - 1] || 1;
        const cycleData = processedCycles[lastCycNum];
        
        if (cycleData) {
            // 수치 카드 등은 최종 사이클 기준으로 표시
            updateAnalysisNumbers(cycleData, lastCycNum);
            // 전체 사이클 오버레이 전압 프로파일 렌더링
            renderOverviewChart(null, true);
            // Slope/Plateau 하이라이트 차트는 개별 분석이므로 마지막 사이클로 폴백
            renderSlopePlateauChart(cycleData, parseFloat(cutoffVoltageInput.value));
        }
        
        calculateRateCapability();
        renderRateCapabilityCharts();
        updateDqDvView();
    } else {
        // 단일 사이클 모드 작동
        const targetCycleNum = parseInt(targetCycleVal);
        const cycleData = processedCycles[targetCycleNum];
        
        if (!cycleData) return;
        
        updateAnalysisNumbers(cycleData, targetCycleNum);
        renderOverviewChart(cycleData, false);
        renderSlopePlateauChart(cycleData, parseFloat(cutoffVoltageInput.value));
        
        calculateRateCapability();
        renderRateCapabilityCharts();
        updateDqDvView();
    }
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

        html += `
            <tr>
                <td>
                    <span class="ds-color-dot" style="background:${ds.color}; display:inline-block; width:8px; height:8px; border-radius:50%; margin-right:6px; vertical-align:middle; box-shadow:0 0 6px ${ds.color};"></span>
                    <strong style="vertical-align:middle; color:#fff;">${ds.customName}</strong>
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
    const targetCycleVal = targetCycleSelect.value;
    const targetCycleNum = targetCycleVal === 'all' ? 1 : parseInt(targetCycleVal);

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

        html += `
            <tr>
                <td>
                    <span class="ds-color-dot" style="background:${ds.color}; display:inline-block; width:8px; height:8px; border-radius:50%; margin-right:6px; vertical-align:middle; box-shadow:0 0 6px ${ds.color};"></span>
                    <strong style="vertical-align:middle; color:#fff;">${ds.customName}</strong>
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

        bodyHTML += `<tr>`;
        bodyHTML += `
            <td>
                <span class="ds-color-dot" style="background:${ds.color}; display:inline-block; width:8px; height:8px; border-radius:50%; margin-right:6px; vertical-align:middle; box-shadow:0 0 6px ${ds.color};"></span>
                <strong style="vertical-align:middle; color:#fff;">${ds.customName}</strong>
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
    
    for (let v = gridMin; v <= gridMax + 1e-9; v += dV) {
        let idx = sorted.findIndex(p => p.voltage >= v);
        if (idx <= 0) continue;
        
        const p0 = sorted[idx - 1];
        const p1 = sorted[idx];
        
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
    if (rawBatteryData.length > 0) {
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

    displayDS.forEach(ds => {
        if (!ds || !ds.processedCycles) return; // 안전장치: GITT 데이터셋 등 CC/CV 구조가 아닌 것은 스킵
        const dsCycles = Object.keys(ds.processedCycles).map(Number).sort((a, b) => a - b);
        if (dsCycles.length === 0) return;

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

    // 테이블 정보 업데이트 (다중 사이클 선택을 적용하므로 targetCycleNum 매개변수는 무시됨)
    updateDqDvTable(displayDS, null, stepVVal, qoVal, postAvgVal);
}

// dQ/dV 주요 산화환원 피크 요약 테이블 갱신
function updateDqDvTable(displayDS, targetCycleNum, stepVVal, qoVal, postAvgVal) {
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
            if (cycleData.desodiation && cycleData.desodiation.length > 0) {
                chargeDqDv = calculateDqDv(cycleData.desodiation, stepVVal, postAvgVal);
            }
            
            let dischargeDqDv = [];
            if (cycleData.sodiation && cycleData.sodiation.length > 0) {
                dischargeDqDv = calculateDqDv(cycleData.sodiation, stepVVal, postAvgVal);
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
            
            html += `
                <tr>
                    <td>
                        <span class="ds-color-dot" style="background:${ds.color}; display:inline-block; width:8px; height:8px; border-radius:50%; margin-right:6px; vertical-align:middle; box-shadow:0 0 6px ${ds.color};"></span>
                        <strong style="vertical-align:middle; color:#fff;">${ds.customName}</strong>
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

    if (isCompareMode) {
        const targetCycleVal = targetCycleSelect.value;

        if (targetCycleVal === 'all') {
            // ===== 비교 오버레이 모드 + 전체 사이클 모드: 체크된 데이터셋의 모든 사이클을 그림 =====
            checkedDS.forEach(ds => {
                const dsCycles = Object.keys(ds.processedCycles).map(Number).sort((a, b) => a - b);
                const totalCycles = dsCycles.length;
                if (totalCycles === 0) return;

                dsCycles.forEach((cNum, idx) => {
                    const cyc = ds.processedCycles[cNum];
                    if (!cyc) return;

                    const sodData = downsamplePoints((cyc.sodiation || []).map(p => ({ x: p.capacity, y: p.voltage })), 300);
                    const desodData = downsamplePoints((cyc.desodiation || []).map(p => ({ x: p.capacity, y: p.voltage })), 300);
                    const mergedData = [...sodData, ...desodData];

                    // 후기 사이클로 갈수록 선이 진해지도록 알파 값 계산
                    const opacity = 0.25 + (idx * 0.75 / Math.max(1, totalCycles - 1));
                    const rgbaColor = hexToRgba(ds.color, opacity);

                    // 범례의 폭증 및 null 노출을 방지하기 위해 첫 번째 사이클에만 라벨 지정
                    const labelName = idx === 0 ? ds.customName : undefined;

                    datasets.push({
                        label: labelName,
                        data: mergedData,
                        borderColor: rgbaColor,
                        backgroundColor: 'transparent',
                        showLine: true,
                        borderWidth: 1.5,
                        pointRadius: 0,
                        fill: false,
                        tension: 0.1
                    });
                });
            });
        } else {
            // ===== 비교 오버레이 모드 + 단일 사이클 모드: 선택된 사이클 기준으로 하나씩 그림 =====
            const targetCycleNum = parseInt(targetCycleVal);

            checkedDS.forEach(ds => {
                const dsCycles = Object.keys(ds.processedCycles).map(Number).sort((a, b) => a - b);
                if (dsCycles.length === 0) return;

                let cNum = targetCycleNum;
                if (!dsCycles.includes(cNum)) {
                    // 선택된 사이클이 없을 경우 가장 가까운 사이클로 폴백
                    cNum = dsCycles.reduce((prev, curr) => Math.abs(curr - targetCycleNum) < Math.abs(prev - targetCycleNum) ? curr : prev);
                }

                const cyc = ds.processedCycles[cNum];
                if (!cyc) return;

                const sodData = downsamplePoints((cyc.sodiation || []).map(p => ({ x: p.capacity, y: p.voltage })), 600);
                const desodData = downsamplePoints((cyc.desodiation || []).map(p => ({ x: p.capacity, y: p.voltage })), 600);
                const mergedData = [...sodData, ...desodData];

                datasets.push({
                    label: `${ds.customName} (Cycle ${cNum})`,
                    data: mergedData,
                    borderColor: ds.color,
                    backgroundColor: 'transparent',
                    showLine: true,
                    borderWidth: 2.5,
                    pointRadius: 0,
                    fill: false,
                    tension: 0.1
                });
            });
        }
    } else if (isAll) {
        // ===== 단일 데이터셋 전체 사이클 오버레이 =====
        const cycleNumbers = Object.keys(processedCycles).map(Number).sort((a, b) => a - b);
        const totalCycles = cycleNumbers.length;
        
        cycleNumbers.forEach((cNum, idx) => {
            const cyc = processedCycles[cNum];
            if (!cyc) return;
            
            // undefined 예외 방지 방어 코드 추가
            const sodData = downsamplePoints((cyc.sodiation || []).map(p => ({ x: p.capacity, y: p.voltage })), 300);
            const desodData = downsamplePoints((cyc.desodiation || []).map(p => ({ x: p.capacity, y: p.voltage })), 300);
            
            const hue = (idx * 280 / Math.max(1, totalCycles - 1));
            const color = `hsla(${hue}, 85%, 55%, 0.8)`;
            const mergedData = [...sodData, ...desodData];
            
            datasets.push({
                label: `Cycle ${cNum}`,
                data: mergedData,
                borderColor: color,
                backgroundColor: 'transparent',
                showLine: true,
                borderWidth: 1.5,
                pointRadius: 0,
                fill: false,
                tension: 0.1
            });
        });
    } else {
        // ===== 단일 사이클 기본 모드 =====
        if (!cycleData) return;
        const sodData = downsamplePoints(cycleData.sodiation.map(p => ({ x: p.capacity, y: p.voltage })), 1500);
        const desodData = downsamplePoints(cycleData.desodiation.map(p => ({ x: p.capacity, y: p.voltage })), 1500);

        datasets.push(
            {
                label: 'Sodiation (Discharge)',
                data: sodData,
                borderColor: 'rgba(245, 158, 11, 0.95)',
                backgroundColor: 'rgba(245, 158, 11, 0.1)',
                showLine: true,
                borderWidth: 2.5,
                pointRadius: 0,
                fill: false,
                tension: 0.1
            },
            {
                label: 'Desodiation (Charge)',
                data: desodData,
                borderColor: 'rgba(59, 130, 246, 0.95)',
                backgroundColor: 'rgba(59, 130, 246, 0.1)',
                showLine: true,
                borderWidth: 2.5,
                pointRadius: 0,
                fill: false,
                tension: 0.1
            }
        );
    }

    const showLegend = isCompareMode || !isAll;

    chartProfileInstance = new Chart(ctx, {
        type: 'scatter',
        data: { datasets },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            animation: { duration: (isAll && !isCompareMode) ? 0 : 400 },
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
                    display: showLegend,
                    labels: { 
                        color: '#fff', 
                        font: { family: 'Outfit' }, 
                        boxWidth: 14, 
                        padding: 12,
                        // 범례 레이아웃에서 undefined 또는 빈 텍스트를 가진 항목 필터링
                        filter: function(item, chartData) {
                            return item.text !== undefined && item.text !== null && item.text !== '';
                        }
                    }
                },
                tooltip: { mode: 'nearest', intersect: false }
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
        const targetCycleVal = targetCycleSelect.value;
        const targetCycleNum = targetCycleVal === 'all' ? 1 : parseInt(targetCycleVal);

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
   5. Demo Data Generator (Realistic Hard Carbon Response)
   ========================================== */
function generateDemoData() {
    return `Cycle,Voltage(V),Capacity(mAh/g),Current(mA)

1,2.7131,0.0,-1.0

1,1.222,6.7546,-1.0

1,1.1561,13.5177,-1.0

1,1.0924,20.2724,-1.0

1,1.0138,27.0354,-1.0

1,0.9198,33.7901,-1.0

1,0.8415,40.5532,-1.0

1,0.7806,47.3079,-1.0

1,0.7247,54.0709,-1.0

1,0.6705,60.8255,-1.0

1,0.6172,67.5884,-1.0

1,0.564,74.3429,-1.0

1,0.5103,81.1057,-1.0

1,0.4568,87.8602,-1.0

1,0.4034,94.623,-1.0

1,0.3508,101.3774,-1.0

1,0.3003,108.1402,-1.0

1,0.2511,114.903,-1.0

1,0.2053,121.6574,-1.0

1,0.1641,128.4202,-1.0

1,0.13,135.1747,-1.0

1,0.1039,141.9375,-1.0

1,0.083,148.692,-1.0

1,0.0663,155.4548,-1.0

1,0.053,162.2093,-1.0

1,0.0435,168.9721,-1.0

1,0.0362,175.7266,-1.0

1,0.0311,182.4894,-1.0

1,0.0273,189.2438,-1.0

1,0.0246,196.0066,-1.0

1,0.0221,202.7611,-1.0

1,0.0197,209.5239,-1.0

1,0.0183,216.2867,-1.0

1,0.0162,223.0412,-1.0

1,0.0148,229.804,-1.0

1,0.0135,236.5585,-1.0

1,0.012,243.3214,-1.0

1,0.0107,250.0759,-1.0

1,0.0091,256.8387,-1.0

1,0.008,263.5932,-1.0

1,0.0064,270.3561,-1.0

1,0.0055,277.1106,-1.0

1,0.004,283.8735,-1.0

1,0.004,290.628,-1.0

1,0.0001,297.3994,-1.0

1,-0.0002,304.1268,-1.0

1,-0.0002,310.7169,-1.0

1,0.0001,317.1044,-1.0

1,-0.0001,323.2911,-1.0

1,-0.0002,329.2789,-1.0

1,-0.0002,335.0574,-1.0

1,-0.0001,340.6415,-1.0

1,-0.0001,346.0225,-1.0

1,0.0001,351.2244,-1.0

1,0.0001,356.2228,-1.0

1,0.0001,361.0301,-1.0

1,-0.0001,365.6374,-1.0

1,0.0001,370.0501,-1.0

1,-0.0001,374.2596,-1.0

1,-0.0001,378.2769,-1.0

1,-0.0001,382.094,-1.0

1,-0.0001,385.7197,-1.0

1,0.0001,389.1464,-1.0

1,0.0001,392.3806,-1.0

1,0.0001,395.4173,-1.0

1,-0.0001,398.2583,-1.0

1,0.0001,400.9039,-1.0

1,0.0001,403.3541,-1.0

1,-0.0001,405.6171,-1.0

1,-0.0001,407.6911,-1.0

1,-0.0001,409.5834,-1.0

1,0.0001,411.2957,-1.0

1,-0.0001,412.8421,-1.0

1,0.0001,414.2308,-1.0

1,0.0002,415.4749,-1.0

1,0.0001,416.5841,-1.0

1,0.0001,417.5761,-1.0

1,0.0001,418.4618,-1.0

1,0.0001,419.2566,-1.0

1,-0.0001,419.9704,-1.0

1,0.0454,0.0,1.0

1,0.0532,4.1987,1.0

1,0.0519,8.3973,1.0

1,0.054,12.596,1.0

1,0.0581,16.7946,1.0

1,0.062,21.0016,1.0

1,0.0662,25.2002,1.0

1,0.0692,29.3989,1.0

1,0.0719,33.5975,1.0

1,0.0736,37.7961,1.0

1,0.075,42.003,1.0

1,0.0761,46.2016,1.0

1,0.0774,50.4002,1.0

1,0.0782,54.5988,1.0

1,0.0785,58.7974,1.0

1,0.0795,63.0044,1.0

1,0.0803,67.203,1.0

1,0.0809,71.4016,1.0

1,0.0814,75.6002,1.0

1,0.0819,79.7988,1.0

1,0.0823,84.0057,1.0

1,0.083,88.2043,1.0

1,0.0833,92.4028,1.0

1,0.0838,96.6014,1.0

1,0.0841,100.8,1.0

1,0.0849,105.0069,1.0

1,0.0852,109.2055,1.0

1,0.0857,113.404,1.0

1,0.0861,117.6026,1.0

1,0.0864,121.8012,1.0

1,0.0869,126.0081,1.0

1,0.0874,130.2067,1.0

1,0.0876,134.4052,1.0

1,0.0882,138.6038,1.0

1,0.0887,142.8024,1.0

1,0.0891,147.0093,1.0

1,0.0896,151.2078,1.0

1,0.0901,155.4064,1.0

1,0.0906,159.605,1.0

1,0.0912,163.8035,1.0

1,0.0917,168.0105,1.0

1,0.0925,172.209,1.0

1,0.0929,176.4076,1.0

1,0.0937,180.6062,1.0

1,0.0945,184.8047,1.0

1,0.0955,189.0117,1.0

1,0.0964,193.2102,1.0

1,0.0975,197.4088,1.0

1,0.0985,201.6074,1.0

1,0.1001,205.806,1.0

1,0.1018,210.013,1.0

1,0.1039,214.2117,1.0

1,0.1066,218.4104,1.0

1,0.1099,222.609,1.0

1,0.1147,226.8077,1.0

1,0.1215,231.0148,1.0

1,0.131,235.2134,1.0

1,0.1429,239.4121,1.0

1,0.1578,243.6108,1.0

1,0.1765,247.8095,1.0

1,0.1999,252.0165,1.0

1,0.2291,256.2152,1.0

1,0.2638,260.4139,1.0

1,0.3023,264.6126,1.0

1,0.3442,268.8114,1.0

1,0.3884,273.0184,1.0

1,0.4347,277.2171,1.0

1,0.4832,281.4157,1.0

1,0.5339,285.6144,1.0

1,0.5862,289.813,1.0

1,0.6407,294.02,1.0

1,0.6971,298.2186,1.0

1,0.7554,302.4173,1.0

1,0.8161,306.6159,1.0

1,0.88,310.8145,1.0

1,0.9502,315.0215,1.0

1,1.0315,319.2201,1.0

1,1.139,323.4187,1.0

1,1.3479,327.6174,1.0

1,2.0001,331.8227,1.0

2,1.2006,0.0,-1.0

2,1.0098,5.2934,-1.0

2,0.9077,10.5951,-1.0

2,0.8184,15.8968,-1.0

2,0.7369,21.1985,-1.0

2,0.661,26.5002,-1.0

2,0.5897,31.8018,-1.0

2,0.5228,37.1035,-1.0

2,0.4603,42.4052,-1.0

2,0.4023,47.7069,-1.0

2,0.3481,53.0086,-1.0

2,0.2982,58.3103,-1.0

2,0.2518,63.6036,-1.0

2,0.2093,68.9052,-1.0

2,0.1739,74.2069,-1.0

2,0.1468,79.5086,-1.0

2,0.1262,84.8102,-1.0

2,0.1099,90.1119,-1.0

2,0.0968,95.4135,-1.0

2,0.0869,100.7152,-1.0

2,0.0801,106.0169,-1.0

2,0.0752,111.3185,-1.0

2,0.0711,116.6202,-1.0

2,0.0682,121.9136,-1.0

2,0.0658,127.2153,-1.0

2,0.0636,132.5169,-1.0

2,0.0616,137.8186,-1.0

2,0.06,143.1203,-1.0

2,0.0586,148.422,-1.0

2,0.057,153.7237,-1.0

2,0.0554,159.0254,-1.0

2,0.0543,164.3271,-1.0

2,0.053,169.6289,-1.0

2,0.0516,174.9306,-1.0

2,0.0503,180.224,-1.0

2,0.049,185.5257,-1.0

2,0.0478,190.8274,-1.0

2,0.0467,196.1292,-1.0

2,0.0451,201.4309,-1.0

2,0.0438,206.7327,-1.0

2,0.0424,212.0344,-1.0

2,0.0413,217.3362,-1.0

2,0.0397,222.6379,-1.0

2,0.0381,227.9397,-1.0

2,0.0365,233.2414,-1.0

2,0.0348,238.5432,-1.0

2,0.0332,243.8366,-1.0

2,0.0311,249.1383,-1.0

2,0.0292,254.4401,-1.0

2,0.0272,259.7418,-1.0

2,0.0245,265.0436,-1.0

2,0.0218,270.3453,-1.0

2,0.0188,275.647,-1.0

2,0.0145,280.9487,-1.0

2,0.0091,286.2505,-1.0

2,0.001,291.5522,-1.0

2,-0.0001,296.2104,-1.0

2,-0.0001,300.0568,-1.0

2,-0.0001,303.5377,-1.0

2,-0.0001,306.7871,-1.0

2,0.0001,309.8637,-1.0

2,-0.0001,312.7878,-1.0

2,-0.0001,315.5575,-1.0

2,0.0001,318.1891,-1.0

2,-0.0001,320.7498,-1.0

2,0.0001,323.0132,-1.0

2,-0.0001,325.1373,-1.0

2,0.0001,327.1116,-1.0

2,-0.0001,328.9296,-1.0

2,-0.0001,330.5983,-1.0

2,0.0001,332.1178,-1.0

2,0.0001,333.4897,-1.0

2,0.0001,334.7276,-1.0

2,0.0001,335.8394,-1.0

2,-0.0001,336.8338,-1.0

2,-0.0002,337.7209,-1.0

2,-0.0002,338.5117,-1.0

2,0.0001,339.2165,-1.0

2,0.0001,339.8455,-1.0

2,-0.0001,340.4065,-1.0

2,0.0419,0.0,1.0

2,0.0368,4.207,1.0

2,0.0383,8.414,1.0

2,0.0422,12.621,1.0

2,0.0473,16.828,1.0

2,0.0522,21.035,1.0

2,0.0571,25.2503,1.0

2,0.0609,29.4573,1.0

2,0.0644,33.6643,1.0

2,0.0665,37.8713,1.0

2,0.0684,42.0783,1.0

2,0.0698,46.2936,1.0

2,0.0711,50.5006,1.0

2,0.0719,54.7076,1.0

2,0.073,58.9146,1.0

2,0.0738,63.1216,1.0

2,0.0746,67.3369,1.0

2,0.0752,71.5439,1.0

2,0.0758,75.7509,1.0

2,0.0765,79.9579,1.0

2,0.0769,84.1649,1.0

2,0.0774,88.3719,1.0

2,0.0779,92.5873,1.0

2,0.0785,96.7943,1.0

2,0.079,101.0014,1.0

2,0.0793,105.2084,1.0

2,0.0801,109.4153,1.0

2,0.0804,113.6307,1.0

2,0.0809,117.8376,1.0

2,0.0815,122.0446,1.0

2,0.082,126.2516,1.0

2,0.0825,130.4585,1.0

2,0.0831,134.6739,1.0

2,0.0834,138.8808,1.0

2,0.0841,143.0878,1.0

2,0.0845,147.2947,1.0

2,0.0852,151.5017,1.0

2,0.0858,155.717,1.0

2,0.0863,159.924,1.0

2,0.0871,164.1309,1.0

2,0.0877,168.3379,1.0

2,0.0884,172.5448,1.0

2,0.089,176.7518,1.0

2,0.0899,180.9671,1.0

2,0.0907,185.174,1.0

2,0.0917,189.381,1.0

2,0.0926,193.5879,1.0

2,0.0939,197.7949,1.0

2,0.0952,202.0102,1.0

2,0.0964,206.2172,1.0

2,0.0983,210.4241,1.0

2,0.1002,214.6311,1.0

2,0.1026,218.8381,1.0

2,0.1063,223.0534,1.0

2,0.1107,227.2604,1.0

2,0.1174,231.4674,1.0

2,0.1264,235.6744,1.0

2,0.1383,239.8813,1.0

2,0.1541,244.0967,1.0

2,0.1733,248.3037,1.0

2,0.1982,252.5106,1.0

2,0.2289,256.7176,1.0

2,0.2646,260.9246,1.0

2,0.3041,265.1316,1.0

2,0.3464,269.3469,1.0

2,0.3911,273.5539,1.0

2,0.4383,277.7609,1.0

2,0.4874,281.9679,1.0

2,0.5388,286.1749,1.0

2,0.5919,290.3902,1.0

2,0.6475,294.5972,1.0

2,0.7044,298.8041,1.0

2,0.7627,303.0111,1.0

2,0.8225,307.2181,1.0

2,0.8849,311.4334,1.0

2,0.9521,315.6404,1.0

2,1.0299,319.8473,1.0

2,1.1326,324.0543,1.0

2,1.3384,328.2613,1.0

2,2.0001,332.4686,1.0

3,1.199,0.0,-1.0

3,1.016,5.0427,-1.0

3,0.9176,10.0854,-1.0

3,0.8304,15.1365,-1.0

3,0.7513,20.1793,-1.0

3,0.6771,25.222,-1.0

3,0.6074,30.2731,-1.0

3,0.5421,35.3158,-1.0

3,0.4809,40.3669,-1.0

3,0.4237,45.4097,-1.0

3,0.3706,50.4524,-1.0

3,0.3218,55.5035,-1.0

3,0.2781,60.5462,-1.0

3,0.2367,65.5889,-1.0

3,0.198,70.64,-1.0

3,0.1662,75.6828,-1.0

3,0.1413,80.7339,-1.0

3,0.1223,85.7766,-1.0

3,0.1071,90.8193,-1.0

3,0.095,95.8704,-1.0

3,0.0861,100.9131,-1.0

3,0.0798,105.9559,-1.0

3,0.075,111.0069,-1.0

3,0.0717,116.0496,-1.0

3,0.069,121.1007,-1.0

3,0.0666,126.1434,-1.0

3,0.0647,131.1861,-1.0

3,0.0628,136.2372,-1.0

3,0.0612,141.2799,-1.0

3,0.0597,146.331,-1.0

3,0.0582,151.3737,-1.0

3,0.0573,156.4164,-1.0

3,0.056,161.4674,-1.0

3,0.0549,166.5101,-1.0

3,0.0536,171.5529,-1.0

3,0.0525,176.6039,-1.0

3,0.0513,181.6466,-1.0

3,0.0505,186.6976,-1.0

3,0.0492,191.7403,-1.0

3,0.0481,196.783,-1.0

3,0.0473,201.8341,-1.0

3,0.0459,206.8768,-1.0

3,0.0448,211.9194,-1.0

3,0.0437,216.9704,-1.0

3,0.0425,222.0131,-1.0

3,0.0414,227.0642,-1.0

3,0.0402,232.1068,-1.0

3,0.0391,237.1495,-1.0

3,0.0378,242.2005,-1.0

3,0.0364,247.2432,-1.0

3,0.0353,252.2858,-1.0

3,0.0338,257.3368,-1.0

3,0.0322,262.3795,-1.0

3,0.0307,267.4304,-1.0

3,0.0292,272.473,-1.0

3,0.0275,277.5156,-1.0

3,0.0254,282.5667,-1.0

3,0.0231,287.6093,-1.0

3,0.0207,292.6603,-1.0

3,0.0178,297.703,-1.0

3,0.0137,302.7457,-1.0

3,0.0074,307.7967,-1.0

3,-0.0001,312.547,-1.0

3,0.0001,315.6652,-1.0

3,-0.0001,318.2483,-1.0

3,-0.0001,320.5932,-1.0

3,-0.0001,322.7596,-1.0

3,-0.0001,324.7494,-1.0

3,-0.0001,326.5766,-1.0

3,-0.0001,328.2473,-1.0

3,-0.0001,329.7595,-1.0

3,-0.0001,331.1222,-1.0

3,0.0001,332.3468,-1.0

3,0.0001,333.4393,-1.0

3,0.0001,334.4131,-1.0

3,0.0002,335.275,-1.0

3,-0.0001,336.0403,-1.0

3,0.0001,336.7205,-1.0

3,-0.0002,337.3234,-1.0

3,0.0001,337.8596,-1.0

3,0.0403,0.0,1.0

3,0.033,4.2069,1.0

3,0.0345,8.4138,1.0

3,0.0389,12.6208,1.0

3,0.0441,16.8277,1.0

3,0.0495,21.0346,1.0

3,0.0546,25.2415,1.0

3,0.0589,29.4484,1.0

3,0.0622,33.6637,1.0

3,0.0646,37.8706,1.0

3,0.0666,42.0775,1.0

3,0.0681,46.2844,1.0

3,0.0693,50.4913,1.0

3,0.0704,54.6982,1.0

3,0.0716,58.9051,1.0

3,0.0722,63.1203,1.0

3,0.073,67.3273,1.0

3,0.0736,71.5342,1.0

3,0.0742,75.7411,1.0

3,0.0749,79.948,1.0

3,0.0755,84.1549,1.0

3,0.076,88.3618,1.0

3,0.0761,92.577,1.0

3,0.0773,96.7839,1.0

3,0.0777,100.9908,1.0

3,0.078,105.1977,1.0

3,0.0787,109.4046,1.0

3,0.0792,113.6116,1.0

3,0.0796,117.8185,1.0

3,0.0801,122.0338,1.0

3,0.0806,126.2408,1.0

3,0.0811,130.4478,1.0

3,0.0815,134.6547,1.0

3,0.0822,138.8617,1.0

3,0.0828,143.0686,1.0

3,0.0833,147.2756,1.0

3,0.0839,151.4909,1.0

3,0.0842,155.6979,1.0

3,0.085,159.9048,1.0

3,0.0855,164.1118,1.0

3,0.0861,168.3188,1.0

3,0.0868,172.5257,1.0

3,0.0877,176.7327,1.0

3,0.0885,180.9396,1.0

3,0.0891,185.1549,1.0

3,0.0901,189.3618,1.0

3,0.091,193.5687,1.0

3,0.092,197.7757,1.0

3,0.0934,201.9826,1.0

3,0.0948,206.1895,1.0

3,0.0966,210.3964,1.0

3,0.0983,214.6116,1.0

3,0.1009,218.8185,1.0

3,0.1039,223.0254,1.0

3,0.1083,227.2323,1.0

3,0.1148,231.4392,1.0

3,0.1239,235.6461,1.0

3,0.1362,239.853,1.0

3,0.1522,244.0683,1.0

3,0.1724,248.2751,1.0

3,0.1977,252.482,1.0

3,0.2292,256.6889,1.0

3,0.2657,260.8958,1.0

3,0.3053,265.1027,1.0

3,0.3481,269.3095,1.0

3,0.3934,273.5248,1.0

3,0.4407,277.7317,1.0

3,0.4904,281.9386,1.0

3,0.5418,286.1455,1.0

3,0.5957,290.3523,1.0

3,0.6513,294.5592,1.0

3,0.7085,298.7661,1.0

3,0.7665,302.9814,1.0

3,0.8256,307.1883,1.0

3,0.8867,311.3952,1.0

3,0.9526,315.602,1.0

3,1.0285,319.8089,1.0

3,1.1292,324.0158,1.0

3,1.3319,328.2227,1.0

3,2.0002,332.4317,1.0

4,1.145,0.0,-1.0

4,0.9615,5.4549,-1.0

4,0.8705,10.9376,-1.0

4,0.7843,16.3924,-1.0

4,0.7038,21.8751,-1.0

4,0.6279,27.3578,-1.0

4,0.5564,32.8127,-1.0

4,0.4887,38.2954,-1.0

4,0.4251,43.7781,-1.0

4,0.366,49.233,-1.0

4,0.3109,54.7157,-1.0

4,0.2614,60.1705,-1.0

4,0.2175,65.6532,-1.0

4,0.179,71.1359,-1.0

4,0.1468,76.5908,-1.0

4,0.122,82.0735,-1.0

4,0.1028,87.5561,-1.0

4,0.0882,93.011,-1.0

4,0.0776,98.4937,-1.0

4,0.0698,103.9764,-1.0

4,0.0647,109.4313,-1.0

4,0.0606,114.914,-1.0

4,0.0574,120.3689,-1.0

4,0.0549,125.8515,-1.0

4,0.0528,131.3343,-1.0

4,0.0505,136.7891,-1.0

4,0.0489,142.2718,-1.0

4,0.0473,147.7545,-1.0

4,0.0456,153.2094,-1.0

4,0.0441,158.6921,-1.0

4,0.0425,164.1469,-1.0

4,0.0413,169.6296,-1.0

4,0.0399,175.1123,-1.0

4,0.0384,180.5671,-1.0

4,0.0372,186.0498,-1.0

4,0.0359,191.5325,-1.0

4,0.0353,196.9874,-1.0

4,0.034,202.4702,-1.0

4,0.0324,207.9529,-1.0

4,0.0302,213.4077,-1.0

4,0.0288,218.8905,-1.0

4,0.0273,224.3454,-1.0

4,0.0256,229.8281,-1.0

4,0.0242,235.3108,-1.0

4,0.0224,240.7657,-1.0

4,0.0207,246.2484,-1.0

4,0.0188,251.7312,-1.0

4,0.0169,257.1861,-1.0

4,0.0145,262.6688,-1.0

4,0.0121,268.1515,-1.0

4,0.0094,273.6064,-1.0

4,0.0064,279.0891,-1.0

4,0.0024,284.544,-1.0

4,0.0002,289.8993,-1.0

4,-0.0001,294.4336,-1.0

4,0.0001,298.1839,-1.0

4,0.0001,301.3331,-1.0

4,-0.0001,303.9736,-1.0

4,0.0001,306.1779,-1.0

4,-0.0001,308.049,-1.0

4,0.0001,309.6281,-1.0

4,-0.0001,311.0043,-1.0

4,0.0001,312.2162,-1.0

4,0.0001,313.2934,-1.0

4,-0.0001,314.2862,-1.0

4,0.0001,315.212,-1.0

4,0.0001,316.0832,-1.0

4,0.0001,316.9183,-1.0

4,-0.0001,317.7201,-1.0

4,0.0001,318.4887,-1.0

4,-0.0001,319.2346,-1.0

4,-0.0004,319.9516,-1.0

4,-0.0001,320.6461,-1.0

4,0.0001,321.3172,-1.0

4,-0.0001,321.964,-1.0

4,-0.0001,322.5943,-1.0

4,0.0001,323.2059,-1.0

4,-0.0001,323.7966,-1.0

4,0.0001,324.3725,-1.0

4,0.0001,324.9311,-1.0

4,0.1167,0.0,1.0

4,0.066,4.0059,1.0

4,0.0616,8.0396,1.0

4,0.0632,12.0733,1.0

4,0.0663,16.1069,1.0

4,0.0695,20.1406,1.0

4,0.0723,24.1742,1.0

4,0.0744,28.2079,1.0

4,0.0761,32.2416,1.0

4,0.0774,36.2474,1.0

4,0.0787,40.2811,1.0

4,0.0796,44.3148,1.0

4,0.0803,48.3484,1.0

4,0.0809,52.3821,1.0

4,0.0817,56.4158,1.0

4,0.082,60.4495,1.0

4,0.0825,64.4831,1.0

4,0.0831,68.5168,1.0

4,0.0836,72.5227,1.0

4,0.0841,76.5564,1.0

4,0.0847,80.59,1.0

4,0.085,84.6237,1.0

4,0.0855,88.6574,1.0

4,0.0858,92.691,1.0

4,0.0863,96.7247,1.0

4,0.0866,100.7583,1.0

4,0.0871,104.792,1.0

4,0.0874,108.7979,1.0

4,0.0879,112.8316,1.0

4,0.0882,116.8653,1.0

4,0.0888,120.8989,1.0

4,0.089,124.9326,1.0

4,0.0895,128.9663,1.0

4,0.0899,132.9999,1.0

4,0.0906,137.0336,1.0

4,0.0909,141.0673,1.0

4,0.0915,145.0731,1.0

4,0.092,149.1068,1.0

4,0.0926,153.1405,1.0

4,0.0929,157.1741,1.0

4,0.0939,161.2078,1.0

4,0.0947,165.2414,1.0

4,0.0952,169.2751,1.0

4,0.096,173.3088,1.0

4,0.0969,177.3146,1.0

4,0.0977,181.3483,1.0

4,0.099,185.382,1.0

4,0.0999,189.4157,1.0

4,0.1012,193.4493,1.0

4,0.1026,197.483,1.0

4,0.1042,201.5167,1.0

4,0.1066,205.5503,1.0

4,0.1091,209.584,1.0

4,0.1124,213.5898,1.0

4,0.1172,217.6235,1.0

4,0.1235,221.6571,1.0

4,0.1324,225.6908,1.0

4,0.1438,229.7245,1.0

4,0.1581,233.7581,1.0

4,0.176,237.7918,1.0

4,0.1983,241.8254,1.0

4,0.2256,245.8591,1.0

4,0.2567,249.8649,1.0

4,0.2911,253.8986,1.0

4,0.3278,257.9322,1.0

4,0.3671,261.9659,1.0

4,0.4093,265.9995,1.0

4,0.4545,270.0332,1.0

4,0.5026,274.0668,1.0

4,0.5534,278.1005,1.0

4,0.6072,282.1341,1.0

4,0.6641,286.1399,1.0

4,0.7247,290.1735,1.0

4,0.7892,294.2072,1.0

4,0.8581,298.2408,1.0

4,0.9333,302.2744,1.0

4,1.0209,306.3081,1.0

4,1.1417,310.3417,1.0

4,1.3794,314.3753,1.0

4,2.0001,318.3922,1.0

5,1.0597,0.0,-1.0

5,0.9046,6.234,-1.0

5,0.8004,12.4959,-1.0

5,0.706,18.7577,-1.0

5,0.6185,25.0196,-1.0

5,0.5367,31.2814,-1.0

5,0.461,37.5432,-1.0

5,0.3908,43.805,-1.0

5,0.3264,50.0391,-1.0

5,0.2682,56.3009,-1.0

5,0.2183,62.5627,-1.0

5,0.175,68.8244,-1.0

5,0.141,75.0862,-1.0

5,0.1161,81.348,-1.0

5,0.0974,87.6097,-1.0

5,0.0842,93.8714,-1.0

5,0.0755,100.1053,-1.0

5,0.0693,106.367,-1.0

5,0.0654,112.6287,-1.0

5,0.0622,118.8904,-1.0

5,0.0593,125.1521,-1.0

5,0.0571,131.4138,-1.0

5,0.0549,137.6756,-1.0

5,0.0533,143.9372,-1.0

5,0.0514,150.1711,-1.0

5,0.0497,156.4328,-1.0

5,0.0481,162.6944,-1.0

5,0.0465,168.9561,-1.0

5,0.0451,175.2178,-1.0

5,0.0435,181.4794,-1.0

5,0.0419,187.7411,-1.0

5,0.0403,194.0028,-1.0

5,0.0389,200.2366,-1.0

5,0.0375,206.4983,-1.0

5,0.036,212.76,-1.0

5,0.0341,219.0216,-1.0

5,0.0326,225.2833,-1.0

5,0.0308,231.5449,-1.0

5,0.0288,237.8065,-1.0

5,0.0269,244.0682,-1.0

5,0.025,250.302,-1.0

5,0.0223,256.5636,-1.0

5,0.0194,262.8252,-1.0

5,0.0158,269.0869,-1.0

5,0.0102,275.3485,-1.0

5,-0.0001,281.5222,-1.0

5,0.0001,285.2953,-1.0

5,0.0001,287.4542,-1.0

5,0.0001,289.1132,-1.0

5,0.0001,290.5833,-1.0

5,0.0001,291.9643,-1.0

5,0.0001,293.3043,-1.0

5,0.0001,294.6123,-1.0

5,-0.0001,295.8924,-1.0

5,0.0001,297.1456,-1.0

5,-0.0001,298.3723,-1.0

5,0.0001,299.5681,-1.0

5,-0.0001,300.7437,-1.0

5,0.0001,301.8946,-1.0

5,-0.0001,303.0202,-1.0

5,0.0001,304.1215,-1.0

5,0.0001,305.2008,-1.0

5,-0.0001,306.2559,-1.0

5,-0.0001,307.2867,-1.0

5,0.0001,308.2878,-1.0

5,-0.0001,309.2677,-1.0

5,0.0001,310.2248,-1.0

5,0.0001,311.1584,-1.0

5,-0.0001,312.0683,-1.0

5,-0.0001,312.9776,-1.0

5,0.0001,313.8899,-1.0

5,-0.0001,314.7887,-1.0

5,-0.0001,315.6241,-1.0

5,-0.0002,316.408,-1.0

5,-0.0001,317.1641,-1.0

5,-0.0001,317.8959,-1.0

5,0.0001,318.6044,-1.0

5,0.0001,319.2901,-1.0

5,0.0001,319.9527,-1.0

5,-0.0002,320.5895,-1.0

5,0.1178,0.0,1.0

5,0.0641,4.0059,1.0

5,0.0593,8.0396,1.0

5,0.0609,12.0732,1.0

5,0.0638,16.1069,1.0

5,0.0668,20.1127,1.0

5,0.0696,24.1463,1.0

5,0.072,28.1799,1.0

5,0.0738,32.2136,1.0

5,0.0752,36.2472,1.0

5,0.0761,40.253,1.0

5,0.0774,44.2866,1.0

5,0.078,48.3203,1.0

5,0.0787,52.3539,1.0

5,0.0793,56.3597,1.0

5,0.08,60.3933,1.0

5,0.0804,64.4269,1.0

5,0.0809,68.4606,1.0

5,0.0815,72.4942,1.0

5,0.082,76.5001,1.0

5,0.0823,80.5337,1.0

5,0.0828,84.5674,1.0

5,0.0833,88.601,1.0

5,0.0838,92.6346,1.0

5,0.0841,96.6405,1.0

5,0.0845,100.6741,1.0

5,0.0849,104.7078,1.0

5,0.0855,108.7414,1.0

5,0.0858,112.7472,1.0

5,0.0863,116.7808,1.0

5,0.0868,120.8145,1.0

5,0.0874,124.8481,1.0

5,0.0876,128.8817,1.0

5,0.088,132.8876,1.0

5,0.0885,136.9212,1.0

5,0.0891,140.9548,1.0

5,0.0896,144.9885,1.0

5,0.0901,149.0222,1.0

5,0.0907,153.028,1.0

5,0.0912,157.0617,1.0

5,0.092,161.0953,1.0

5,0.0926,165.129,1.0

5,0.0934,169.1348,1.0

5,0.0942,173.1685,1.0

5,0.0948,177.2021,1.0

5,0.0958,181.2358,1.0

5,0.0966,185.2695,1.0

5,0.098,189.2753,1.0

5,0.099,193.3089,1.0

5,0.1004,197.3426,1.0

5,0.1018,201.3762,1.0

5,0.1039,205.4099,1.0

5,0.1064,209.4158,1.0

5,0.1097,213.4494,1.0

5,0.1145,217.4831,1.0

5,0.1208,221.5167,1.0

5,0.13,225.5226,1.0

5,0.1421,229.5562,1.0

5,0.1567,233.5899,1.0

5,0.1749,237.6235,1.0

5,0.1974,241.6572,1.0

5,0.2245,245.663,1.0

5,0.2559,249.6967,1.0

5,0.2901,253.7303,1.0

5,0.3269,257.764,1.0

5,0.3657,261.7976,1.0

5,0.4072,265.8034,1.0

5,0.4518,269.8371,1.0

5,0.4993,273.8707,1.0

5,0.55,277.9044,1.0

5,0.6034,281.9102,1.0

5,0.6607,285.9439,1.0

5,0.7214,289.9775,1.0

5,0.7859,294.0111,1.0

5,0.855,298.0447,1.0

5,0.9301,302.0506,1.0

5,1.0179,306.0842,1.0

5,1.1387,310.1178,1.0

5,1.3775,314.1514,1.0

5,2.0002,318.1628,1.0

6,1.0582,0.0,-1.0

6,0.9149,5.5661,-1.0

6,0.8214,11.1322,-1.0

6,0.7337,16.6983,-1.0

6,0.6537,22.2644,-1.0

6,0.5787,27.8305,-1.0

6,0.5084,33.3965,-1.0

6,0.4431,38.9627,-1.0

6,0.3817,44.5288,-1.0

6,0.3247,50.0949,-1.0

6,0.2728,55.661,-1.0

6,0.2277,61.2271,-1.0

6,0.1879,66.7931,-1.0

6,0.1543,72.3592,-1.0

6,0.1288,77.9253,-1.0

6,0.1093,83.4914,-1.0

6,0.0944,89.0853,-1.0

6,0.0834,94.6514,-1.0

6,0.0761,100.2175,-1.0

6,0.0709,105.7836,-1.0

6,0.0673,111.3497,-1.0

6,0.0639,116.9158,-1.0

6,0.0619,122.482,-1.0

6,0.0593,128.0481,-1.0

6,0.0574,133.6142,-1.0

6,0.056,139.1804,-1.0

6,0.0543,144.7465,-1.0

6,0.0527,150.3126,-1.0

6,0.0516,155.8788,-1.0

6,0.0503,161.445,-1.0

6,0.0489,167.0111,-1.0

6,0.0476,172.5773,-1.0

6,0.0464,178.1714,-1.0

6,0.0451,183.7375,-1.0

6,0.0438,189.3038,-1.0

6,0.0429,194.87,-1.0

6,0.0416,200.4362,-1.0

6,0.0403,206.0024,-1.0

6,0.0391,211.5685,-1.0

6,0.0378,217.1348,-1.0

6,0.0364,222.701,-1.0

6,0.0349,228.2672,-1.0

6,0.0337,233.8334,-1.0

6,0.0321,239.3996,-1.0

6,0.0305,244.9658,-1.0

6,0.0289,250.532,-1.0

6,0.0273,256.0982,-1.0

6,0.0253,261.6644,-1.0

6,0.0232,267.2585,-1.0

6,0.0207,272.8246,-1.0

6,0.0178,278.3908,-1.0

6,0.0137,283.957,-1.0

6,0.0063,289.5231,-1.0

6,0.0001,294.5969,-1.0

6,0.0001,297.6114,-1.0

6,-0.0001,299.6022,-1.0

6,0.0001,301.1219,-1.0

6,0.0001,302.4018,-1.0

6,0.0001,303.5684,-1.0

6,0.0001,304.6701,-1.0

6,0.0001,305.717,-1.0

6,-0.0001,306.7004,-1.0

6,-0.0001,307.6514,-1.0

6,-0.0001,308.5741,-1.0

6,-0.0002,309.4752,-1.0

6,-0.0001,310.3449,-1.0

6,-0.0001,311.1901,-1.0

6,0.0001,312.0091,-1.0

6,-0.0001,312.8092,-1.0

6,0.0002,313.5867,-1.0

6,-0.0001,314.3406,-1.0

6,0.0001,315.0717,-1.0

6,-0.0001,315.7814,-1.0

6,-0.0002,316.4699,-1.0

6,-0.0001,317.1374,-1.0

6,-0.0001,317.7848,-1.0

6,-0.0001,318.4121,-1.0

6,0.0001,319.0197,-1.0

6,-0.0001,319.6075,-1.0

6,-0.0001,320.1789,-1.0

6,0.1123,0.0,1.0

6,0.0614,4.0059,1.0

6,0.0578,8.0395,1.0

6,0.0592,12.0732,1.0

6,0.0622,16.1068,1.0

6,0.0655,20.1405,1.0

6,0.0684,24.1741,1.0

6,0.0709,28.18,1.0

6,0.073,32.2136,1.0

6,0.0741,36.2472,1.0

6,0.0754,40.2809,1.0

6,0.0763,44.3145,1.0

6,0.0771,48.3481,1.0

6,0.0779,52.3539,1.0

6,0.0787,56.3876,1.0

6,0.0792,60.4212,1.0

6,0.08,64.4549,1.0

6,0.0803,68.4885,1.0

6,0.0806,72.5221,1.0

6,0.0812,76.528,1.0

6,0.0817,80.5616,1.0

6,0.082,84.5952,1.0

6,0.0826,88.6289,1.0

6,0.0831,92.6626,1.0

6,0.0834,96.6962,1.0

6,0.0839,100.702,1.0

6,0.0844,104.7357,1.0

6,0.0849,108.7693,1.0

6,0.0855,112.803,1.0

6,0.0857,116.8366,1.0

6,0.0861,120.8702,1.0

6,0.0868,124.8761,1.0

6,0.0871,128.9097,1.0

6,0.0877,132.9434,1.0

6,0.0882,136.977,1.0

6,0.0885,141.0107,1.0

6,0.089,145.0443,1.0

6,0.0893,149.0501,1.0

6,0.0898,153.0838,1.0

6,0.0903,157.1174,1.0

6,0.0909,161.151,1.0

6,0.0917,165.1847,1.0

6,0.0929,169.2183,1.0

6,0.0936,173.2241,1.0

6,0.0942,177.2578,1.0

6,0.0952,181.2914,1.0

6,0.0961,185.325,1.0

6,0.0972,189.3587,1.0

6,0.0983,193.3923,1.0

6,0.0996,197.3982,1.0

6,0.1013,201.4318,1.0

6,0.1032,205.4655,1.0

6,0.1055,209.4991,1.0

6,0.1088,213.5328,1.0

6,0.1131,217.5664,1.0

6,0.1194,221.5722,1.0

6,0.1283,225.6059,1.0

6,0.1402,229.6396,1.0

6,0.1544,233.6732,1.0

6,0.1724,237.7069,1.0

6,0.1944,241.7405,1.0

6,0.221,245.7463,1.0

6,0.2519,249.78,1.0

6,0.2861,253.8136,1.0

6,0.3226,257.8473,1.0

6,0.3619,261.8809,1.0

6,0.4036,265.9145,1.0

6,0.4481,269.9204,1.0

6,0.496,273.954,1.0

6,0.5465,277.9877,1.0

6,0.6003,282.0213,1.0

6,0.6572,286.0549,1.0

6,0.7177,290.0885,1.0

6,0.7819,294.0943,1.0

6,0.8512,298.128,1.0

6,0.9269,302.1616,1.0

6,1.0144,306.1952,1.0

6,1.1346,310.2288,1.0

6,1.3716,314.2625,1.0

6,2.0005,318.2863,1.0

7,1.0147,0.0,-1.0

7,0.8995,4.3972,-1.0

7,0.8318,8.85,-1.0

7,0.7656,13.2471,-1.0

7,0.7014,17.6999,-1.0

7,0.6401,22.1526,-1.0

7,0.5819,26.5498,-1.0

7,0.5256,31.0025,-1.0

7,0.4717,35.4553,-1.0

7,0.4212,39.8524,-1.0

7,0.3725,44.3052,-1.0

7,0.3262,48.758,-1.0

7,0.2835,53.1552,-1.0

7,0.2438,57.608,-1.0

7,0.2082,62.0608,-1.0

7,0.1781,66.4579,-1.0

7,0.1517,70.9107,-1.0

7,0.13,75.3079,-1.0

7,0.1123,79.7607,-1.0

7,0.098,84.2134,-1.0

7,0.0866,88.6106,-1.0

7,0.0777,93.0634,-1.0

7,0.0711,97.5161,-1.0

7,0.066,101.9133,-1.0

7,0.0622,106.3661,-1.0

7,0.0592,110.8189,-1.0

7,0.0567,115.216,-1.0

7,0.0544,119.6688,-1.0

7,0.0527,124.1216,-1.0

7,0.0509,128.5187,-1.0

7,0.0494,132.9715,-1.0

7,0.0479,137.4243,-1.0

7,0.0464,141.8214,-1.0

7,0.0452,146.2742,-1.0

7,0.044,150.6714,-1.0

7,0.043,155.1241,-1.0

7,0.0418,159.5769,-1.0

7,0.0406,163.9741,-1.0

7,0.0395,168.4269,-1.0

7,0.0386,172.8797,-1.0

7,0.0375,177.2768,-1.0

7,0.0362,181.7296,-1.0

7,0.0353,186.1824,-1.0

7,0.0341,190.5796,-1.0

7,0.0332,195.0324,-1.0

7,0.0321,199.4852,-1.0

7,0.0311,203.8823,-1.0

7,0.03,208.3351,-1.0

7,0.0288,212.7322,-1.0

7,0.0276,217.185,-1.0

7,0.0265,221.6378,-1.0

7,0.0253,226.035,-1.0

7,0.0242,230.4878,-1.0

7,0.0231,234.9406,-1.0

7,0.0215,239.3377,-1.0

7,0.0202,243.7906,-1.0

7,0.0186,248.2434,-1.0

7,0.0169,252.6405,-1.0

7,0.0153,257.0933,-1.0

7,0.0134,261.5461,-1.0

7,0.0113,265.9433,-1.0

7,0.0089,270.3961,-1.0

7,0.0061,274.8489,-1.0

7,0.0026,279.2461,-1.0

7,0.0001,283.6232,-1.0

7,0.0001,287.3105,-1.0

7,0.0001,290.3691,-1.0

7,-0.0001,292.848,-1.0

7,0.0001,294.8071,-1.0

7,-0.0001,296.3863,-1.0

7,0.0001,297.6353,-1.0

7,-0.0001,298.6129,-1.0

7,-0.0001,299.4093,-1.0

7,-0.0001,300.0812,-1.0

7,0.0001,300.6678,-1.0

7,-0.0001,301.2088,-1.0

7,0.0001,301.7169,-1.0

7,-0.0001,302.1975,-1.0

7,-0.0001,302.6679,-1.0

7,-0.0001,303.1204,-1.0

7,0.1647,0.0,1.0

7,0.0923,3.7837,1.0

7,0.0855,7.5673,1.0

7,0.0841,11.3509,1.0

7,0.0844,15.1345,1.0

7,0.0852,18.9181,1.0

7,0.0858,22.7017,1.0

7,0.0866,26.4853,1.0

7,0.0872,30.2689,1.0

7,0.0877,34.0525,1.0

7,0.0884,37.8361,1.0

7,0.0885,41.6197,1.0

7,0.0888,45.4033,1.0

7,0.0895,49.1869,1.0

7,0.0898,52.9705,1.0

7,0.0901,56.7541,1.0

7,0.0904,60.5377,1.0

7,0.0907,64.3213,1.0

7,0.0909,68.1049,1.0

7,0.0914,71.8885,1.0

7,0.0917,75.6721,1.0

7,0.0922,79.4557,1.0

7,0.0923,83.2393,1.0

7,0.0925,87.0229,1.0

7,0.0931,90.8066,1.0

7,0.0934,94.5902,1.0

7,0.0937,98.3738,1.0

7,0.0942,102.1574,1.0

7,0.0945,105.941,1.0

7,0.0948,109.7246,1.0

7,0.0953,113.5082,1.0

7,0.0958,117.2918,1.0

7,0.0963,121.0754,1.0

7,0.0968,124.859,1.0

7,0.0972,128.6426,1.0

7,0.0977,132.4262,1.0

7,0.0982,136.2098,1.0

7,0.0987,139.9934,1.0

7,0.0993,143.777,1.0

7,0.0999,147.5606,1.0

7,0.1006,151.3999,1.0

7,0.1012,155.1835,1.0

7,0.1018,158.9671,1.0

7,0.1026,162.7507,1.0

7,0.1036,166.5343,1.0

7,0.1044,170.3179,1.0

7,0.1055,174.1016,1.0

7,0.1067,177.8852,1.0

7,0.108,181.6688,1.0

7,0.1096,185.4524,1.0

7,0.1113,189.236,1.0

7,0.1139,193.0196,1.0

7,0.1169,196.8032,1.0

7,0.1207,200.5869,1.0

7,0.1259,204.3704,1.0

7,0.133,208.1541,1.0

7,0.1422,211.9377,1.0

7,0.1538,215.7214,1.0

7,0.1678,219.505,1.0

7,0.1849,223.2886,1.0

7,0.2056,227.0722,1.0

7,0.2307,230.8558,1.0

7,0.2597,234.6395,1.0

7,0.2912,238.4231,1.0

7,0.3258,242.2067,1.0

7,0.3627,245.9903,1.0

7,0.4023,249.774,1.0

7,0.4442,253.5576,1.0

7,0.4889,257.3412,1.0

7,0.5362,261.1248,1.0

7,0.5865,264.9084,1.0

7,0.6401,268.692,1.0

7,0.6977,272.4756,1.0

7,0.7605,276.2592,1.0

7,0.8299,280.0428,1.0

7,0.9095,283.8264,1.0

7,1.0058,287.61,1.0

7,1.1423,291.3936,1.0

7,1.3967,295.1772,1.0

7,2.0007,299.0081,1.0

8,0.9659,0.0,-1.0

8,0.8456,5.5662,-1.0

8,0.7599,11.1879,-1.0

8,0.6789,16.8097,-1.0

8,0.6023,22.4315,-1.0

8,0.5302,28.0533,-1.0

8,0.4621,33.6751,-1.0

8,0.3982,39.2969,-1.0

8,0.3388,44.863,-1.0

8,0.283,50.4848,-1.0

8,0.2331,56.1065,-1.0

8,0.1901,61.7283,-1.0

8,0.1551,67.3501,-1.0

8,0.1273,72.9718,-1.0

8,0.1063,78.5936,-1.0

8,0.0903,84.1597,-1.0

8,0.0785,89.7815,-1.0

8,0.0704,95.4032,-1.0

8,0.0649,101.025,-1.0

8,0.0606,106.6468,-1.0

8,0.0574,112.2685,-1.0

8,0.0549,117.8903,-1.0

8,0.0527,123.4564,-1.0

8,0.0508,129.0782,-1.0

8,0.0489,134.7,-1.0

8,0.0473,140.3218,-1.0

8,0.0456,145.9436,-1.0

8,0.044,151.5654,-1.0

8,0.0425,157.1872,-1.0

8,0.0413,162.7533,-1.0

8,0.04,168.3751,-1.0

8,0.0384,173.9968,-1.0

8,0.0373,179.6186,-1.0

8,0.0359,185.2404,-1.0

8,0.0346,190.8622,-1.0

8,0.033,196.484,-1.0

8,0.0318,202.0501,-1.0

8,0.0302,207.6719,-1.0

8,0.0288,213.2937,-1.0

8,0.0273,218.9155,-1.0

8,0.0256,224.5372,-1.0

8,0.0237,230.159,-1.0

8,0.0218,235.7808,-1.0

8,0.0194,241.4026,-1.0

8,0.0167,246.9687,-1.0

8,0.0129,252.5905,-1.0

8,0.0077,258.2123,-1.0

8,-0.0001,263.8192,-1.0

8,-0.0001,268.2572,-1.0

8,0.0001,271.2672,-1.0

8,0.0001,273.3585,-1.0

8,0.0001,274.9136,-1.0

8,0.0001,276.1925,-1.0

8,-0.0001,277.2926,-1.0

8,-0.0001,278.2875,-1.0

8,0.0001,279.2214,-1.0

8,0.0001,280.0933,-1.0

8,0.0001,280.9111,-1.0

8,-0.0001,281.6919,-1.0

8,-0.0001,282.4412,-1.0

8,0.0001,283.1852,-1.0

8,-0.0001,283.9083,-1.0

8,0.0001,284.6109,-1.0

8,0.0001,285.302,-1.0

8,0.0001,285.9833,-1.0

8,-0.0001,286.6472,-1.0

8,-0.0001,287.3089,-1.0

8,-0.0001,287.9625,-1.0

8,-0.0001,288.6087,-1.0

8,0.0002,289.2462,-1.0

8,0.0001,289.8759,-1.0

8,0.0001,290.4957,-1.0

8,0.0001,291.0983,-1.0

8,0.0001,291.7003,-1.0

8,0.0001,292.2963,-1.0

8,0.0001,292.8857,-1.0

8,-0.0001,293.4707,-1.0

8,-0.0002,294.0493,-1.0

8,0.0001,294.6213,-1.0

8,-0.0001,295.183,-1.0

8,0.1846,0.0,1.0

8,0.0936,3.6724,1.0

8,0.0869,7.4004,1.0

8,0.086,11.1284,1.0

8,0.0861,14.8564,1.0

8,0.0866,18.5844,1.0

8,0.0872,22.3123,1.0

8,0.088,26.0403,1.0

8,0.0884,29.7683,1.0

8,0.0887,33.4963,1.0

8,0.0891,37.2243,1.0

8,0.0895,40.9522,1.0

8,0.0898,44.6802,1.0

8,0.0899,48.4082,1.0

8,0.0903,52.1362,1.0

8,0.0907,55.8641,1.0

8,0.0909,59.5365,1.0

8,0.0914,63.2644,1.0

8,0.0917,66.9924,1.0

8,0.092,70.7204,1.0

8,0.0923,74.4483,1.0

8,0.0923,78.1763,1.0

8,0.0929,81.9043,1.0

8,0.0933,85.6323,1.0

8,0.0936,89.3602,1.0

8,0.0939,93.0882,1.0

8,0.0941,96.8162,1.0

8,0.0948,100.5441,1.0

8,0.0948,104.2721,1.0

8,0.0955,108.0001,1.0

8,0.0958,111.728,1.0

8,0.0961,115.456,1.0

8,0.0966,119.1283,1.0

8,0.0969,122.8563,1.0

8,0.0975,126.5843,1.0

8,0.098,130.3122,1.0

8,0.0987,134.0402,1.0

8,0.0991,137.7682,1.0

8,0.0996,141.4961,1.0

8,0.1004,145.2241,1.0

8,0.1009,148.9521,1.0

8,0.1017,152.68,1.0

8,0.1025,156.408,1.0

8,0.1031,160.1359,1.0

8,0.104,163.8639,1.0

8,0.1052,167.5918,1.0

8,0.1061,171.3198,1.0

8,0.1075,175.0477,1.0

8,0.1091,178.72,1.0

8,0.1107,182.448,1.0

8,0.1126,186.1759,1.0

8,0.1153,189.9038,1.0

8,0.1189,193.6318,1.0

8,0.1234,197.3597,1.0

8,0.1299,201.0877,1.0

8,0.1381,204.8156,1.0

8,0.1481,208.5436,1.0

8,0.1606,212.2715,1.0

8,0.1758,215.9995,1.0

8,0.1944,219.7274,1.0

8,0.2166,223.4554,1.0

8,0.2427,227.1833,1.0

8,0.2719,230.9113,1.0

8,0.3034,234.6392,1.0

8,0.3365,238.3115,1.0

8,0.3725,242.0394,1.0

8,0.4112,245.7674,1.0

8,0.4526,249.4953,1.0

8,0.4963,253.2233,1.0

8,0.5432,256.9512,1.0

8,0.5931,260.6791,1.0

8,0.6462,264.4071,1.0

8,0.7036,268.135,1.0

8,0.7656,271.863,1.0

8,0.835,275.5909,1.0

8,0.9144,279.3188,1.0

8,1.0112,283.0468,1.0

8,1.1494,286.7747,1.0

8,1.4092,290.5027,1.0

8,2.0002,294.1916,1.0

9,0.965,0.0,-1.0

9,0.8372,6.067,-1.0

9,0.7443,12.1897,-1.0

9,0.6572,18.3123,-1.0

9,0.576,24.3793,-1.0

9,0.4992,30.502,-1.0

9,0.4269,36.6246,-1.0

9,0.3598,42.7473,-1.0

9,0.2979,48.8142,-1.0

9,0.2419,54.9369,-1.0

9,0.1939,61.0595,-1.0

9,0.1554,67.1265,-1.0

9,0.1253,73.2491,-1.0

9,0.1032,79.3717,-1.0

9,0.0868,85.4943,-1.0

9,0.0754,91.5612,-1.0

9,0.0677,97.6838,-1.0

9,0.0624,103.8064,-1.0

9,0.0586,109.8734,-1.0

9,0.0557,115.996,-1.0

9,0.053,122.1185,-1.0

9,0.0506,128.2411,-1.0

9,0.0487,134.308,-1.0

9,0.0468,140.4306,-1.0

9,0.0454,146.5532,-1.0

9,0.0441,152.6758,-1.0

9,0.0429,158.7427,-1.0

9,0.0413,164.8652,-1.0

9,0.04,170.9878,-1.0

9,0.0386,177.0547,-1.0

9,0.0368,183.1772,-1.0

9,0.0343,189.2998,-1.0

9,0.0329,195.4223,-1.0

9,0.0315,201.4892,-1.0

9,0.0299,207.6118,-1.0

9,0.028,213.7343,-1.0

9,0.0261,219.8012,-1.0

9,0.0242,225.9237,-1.0

9,0.0216,232.0462,-1.0

9,0.0191,238.1687,-1.0

9,0.0158,244.2355,-1.0

9,0.0108,250.358,-1.0

9,0.0026,256.4805,-1.0

9,0.0001,261.8365,-1.0

9,-0.0001,265.3328,-1.0

9,-0.0001,267.7251,-1.0

9,-0.0001,269.4598,-1.0

9,-0.0001,270.8689,-1.0

9,0.0001,272.1151,-1.0

9,0.0001,273.2288,-1.0

9,-0.0001,274.2624,-1.0

9,0.0001,275.2212,-1.0

9,-0.0001,276.124,-1.0

9,0.0001,276.9977,-1.0

9,0.0002,277.83,-1.0

9,-0.0001,278.6505,-1.0

9,-0.0001,279.455,-1.0

9,-0.0001,280.2459,-1.0

9,-0.0001,281.0182,-1.0

9,0.0001,281.7885,-1.0

9,0.0001,282.5499,-1.0

9,0.0001,283.3031,-1.0

9,-0.0001,284.0416,-1.0

9,-0.0002,284.7769,-1.0

9,0.0001,285.5048,-1.0

9,0.0001,286.2177,-1.0

9,0.0001,286.929,-1.0

9,-0.0001,287.6333,-1.0

9,-0.0001,288.3265,-1.0

9,0.0001,289.0057,-1.0

9,-0.0001,289.6839,-1.0

9,0.0001,290.3547,-1.0

9,-0.0001,291.0085,-1.0

9,-0.0002,291.6606,-1.0

9,-0.0001,292.3077,-1.0

9,0.0001,292.9463,-1.0

9,-0.0001,293.5744,-1.0

9,-0.0001,294.2003,-1.0

9,0.0001,294.8201,-1.0

9,-0.0001,295.4344,-1.0

9,0.1852,0.0,1.0

9,0.0915,3.6723,1.0

9,0.086,7.4002,1.0

9,0.0853,11.1282,1.0

9,0.0857,14.8561,1.0

9,0.0861,18.584,1.0

9,0.0869,22.3119,1.0

9,0.0876,26.0399,1.0

9,0.088,29.7678,1.0

9,0.0885,33.4957,1.0

9,0.089,37.2236,1.0

9,0.0891,40.9515,1.0

9,0.0895,44.6795,1.0

9,0.0898,48.4074,1.0

9,0.0904,52.1353,1.0

9,0.0906,55.8632,1.0

9,0.0909,59.5911,1.0

9,0.091,63.319,1.0

9,0.0914,67.0469,1.0

9,0.0917,70.7748,1.0

9,0.0922,74.5027,1.0

9,0.0925,78.2306,1.0

9,0.0928,81.9585,1.0

9,0.0931,85.6864,1.0

9,0.0934,89.4143,1.0

9,0.0939,93.1422,1.0

9,0.0942,96.8701,1.0

9,0.0945,100.598,1.0

9,0.0948,104.3259,1.0

9,0.0953,108.0538,1.0

9,0.096,111.7817,1.0

9,0.096,115.5096,1.0

9,0.0964,119.2375,1.0

9,0.0971,122.9654,1.0

9,0.0974,126.6933,1.0

9,0.098,130.4212,1.0

9,0.0985,134.1491,1.0

9,0.099,137.877,1.0

9,0.0998,141.6049,1.0

9,0.1002,145.3328,1.0

9,0.1009,149.0607,1.0

9,0.1015,152.7886,1.0

9,0.1023,156.5165,1.0

9,0.1031,160.2444,1.0

9,0.1039,163.9723,1.0

9,0.105,167.7002,1.0

9,0.1063,171.4281,1.0

9,0.1072,175.156,1.0

9,0.1088,178.8839,1.0

9,0.1107,182.6118,1.0

9,0.1128,186.3397,1.0

9,0.1151,190.0676,1.0

9,0.1188,193.7955,1.0

9,0.1235,197.5234,1.0

9,0.1299,201.2513,1.0

9,0.1381,204.9792,1.0

9,0.1483,208.7071,1.0

9,0.1606,212.435,1.0

9,0.176,216.1629,1.0

9,0.1944,219.8908,1.0

9,0.2167,223.6187,1.0

9,0.2429,227.3466,1.0

9,0.272,231.0745,1.0

9,0.3033,234.8024,1.0

9,0.337,238.5303,1.0

9,0.3727,242.2582,1.0

9,0.4109,245.9861,1.0

9,0.4518,249.714,1.0

9,0.4957,253.4419,1.0

9,0.542,257.1697,1.0

9,0.5917,260.8976,1.0

9,0.6448,264.6255,1.0

9,0.7022,268.3534,1.0

9,0.7643,272.0813,1.0

9,0.8333,275.8091,1.0

9,0.9123,279.537,1.0

9,1.0092,283.2649,1.0

9,1.1464,286.9927,1.0

9,1.4051,290.7206,1.0

9,2.0005,294.429,1.0

10,0.8857,0.0,-1.0

10,0.7982,4.3149,-1.0

10,0.7432,8.6299,-1.0

10,0.6867,12.9449,-1.0

10,0.6309,17.2598,-1.0

10,0.5741,21.714,-1.0

10,0.5206,26.029,-1.0

10,0.469,30.344,-1.0

10,0.4193,34.659,-1.0

10,0.3717,38.974,-1.0

10,0.3248,43.4282,-1.0

10,0.2811,47.7432,-1.0

10,0.2403,52.0581,-1.0

10,0.2028,56.373,-1.0

10,0.1695,60.688,-1.0

10,0.1408,65.1421,-1.0

10,0.1185,69.4571,-1.0

10,0.0998,73.772,-1.0

10,0.0842,78.0872,-1.0

10,0.072,82.4022,-1.0

10,0.0616,86.8563,-1.0

10,0.0538,91.1712,-1.0

10,0.0479,95.4861,-1.0

10,0.0438,99.8011,-1.0

10,0.0402,104.1161,-1.0

10,0.0372,108.5701,-1.0

10,0.0346,112.885,-1.0

10,0.0322,117.2001,-1.0

10,0.0305,121.515,-1.0

10,0.0286,125.8299,-1.0

10,0.027,130.2841,-1.0

10,0.0254,134.5991,-1.0

10,0.0238,138.914,-1.0

10,0.0224,143.2289,-1.0

10,0.021,147.544,-1.0

10,0.0197,151.998,-1.0

10,0.0185,156.313,-1.0

10,0.0172,160.6279,-1.0

10,0.0158,164.9428,-1.0

10,0.0145,169.2577,-1.0

10,0.0132,173.7118,-1.0

10,0.0118,178.0268,-1.0

10,0.0105,182.3418,-1.0

10,0.0091,186.6568,-1.0

10,0.0078,190.9717,-1.0

10,0.0064,195.4258,-1.0

10,0.0048,199.7408,-1.0

10,0.0029,204.0557,-1.0

10,0.0013,208.3705,-1.0

10,-0.0001,212.6832,-1.0

10,-0.0001,216.9943,-1.0

10,0.0001,220.9839,-1.0

10,-0.0001,224.7964,-1.0

10,-0.0001,228.4318,-1.0

10,-0.0001,231.8886,-1.0

10,-0.0001,235.2704,-1.0

10,-0.0001,238.3664,-1.0

10,-0.0001,241.2856,-1.0

10,0.0001,244.0317,-1.0

10,0.0001,246.607,-1.0

10,0.0001,249.0862,-1.0

10,0.0001,251.3126,-1.0

10,0.0001,253.3737,-1.0

10,-0.0001,255.2731,-1.0

10,-0.0001,257.0079,-1.0

10,0.0001,258.6362,-1.0

10,-0.0001,260.0703,-1.0

10,-0.0001,261.371,-1.0

10,-0.0001,262.5464,-1.0

10,-0.0001,263.6137,-1.0

10,0.0001,264.6021,-1.0

10,-0.0001,265.4653,-1.0

10,0.0001,266.2501,-1.0

10,0.0001,266.9641,-1.0

10,-0.0001,267.6151,-1.0

10,-0.0001,268.2329,-1.0

10,-0.0001,268.7879,-1.0

10,0.0001,269.3039,-1.0

10,0.0001,269.7863,-1.0

10,0.0001,270.2449,-1.0

10,0.2196,0.0,1.0

10,0.1426,3.3379,1.0

10,0.1327,6.6759,1.0

10,0.1284,10.0139,1.0

10,0.1259,13.3518,1.0

10,0.1245,16.6898,1.0

10,0.1235,20.0277,1.0

10,0.1226,23.3656,1.0

10,0.122,26.7035,1.0

10,0.1215,30.0415,1.0

10,0.121,33.3795,1.0

10,0.1208,36.7174,1.0

10,0.1205,40.0553,1.0

10,0.1202,43.3933,1.0

10,0.1199,46.8702,1.0

10,0.1199,50.2082,1.0

10,0.1197,53.5461,1.0

10,0.1196,56.884,1.0

10,0.1196,60.222,1.0

10,0.1196,63.5599,1.0

10,0.1197,66.8978,1.0

10,0.1197,70.2357,1.0

10,0.1197,73.5737,1.0

10,0.1197,76.9115,1.0

10,0.1199,80.2494,1.0

10,0.1202,83.5874,1.0

10,0.1202,86.9253,1.0

10,0.1207,90.4023,1.0

10,0.1208,93.7402,1.0

10,0.121,97.0781,1.0

10,0.1212,100.416,1.0

10,0.1215,103.7539,1.0

10,0.1218,107.0918,1.0

10,0.1223,110.4296,1.0

10,0.1226,113.7675,1.0

10,0.1231,117.1053,1.0

10,0.1235,120.4431,1.0

10,0.124,123.781,1.0

10,0.1246,127.119,1.0

10,0.1253,130.4569,1.0

10,0.1262,133.9338,1.0

10,0.1267,137.2716,1.0

10,0.1277,140.6096,1.0

10,0.1288,143.9475,1.0

10,0.1297,147.2854,1.0

10,0.1313,150.6233,1.0

10,0.1326,153.9612,1.0

10,0.1343,157.299,1.0

10,0.1365,160.6369,1.0

10,0.1392,163.9747,1.0

10,0.1421,167.3127,1.0

10,0.1459,170.6505,1.0

10,0.1506,173.9884,1.0

10,0.1565,177.4655,1.0

10,0.1635,180.8034,1.0

10,0.172,184.1413,1.0

10,0.1823,187.4791,1.0

10,0.1947,190.817,1.0

10,0.2096,194.1549,1.0

10,0.2275,197.4927,1.0

10,0.2487,200.8305,1.0

10,0.2732,204.1684,1.0

10,0.3003,207.5061,1.0

10,0.3299,210.844,1.0

10,0.3611,214.1819,1.0

10,0.3946,217.5197,1.0

10,0.4315,220.9966,1.0

10,0.4692,224.3345,1.0

10,0.5093,227.6723,1.0

10,0.5515,231.0102,1.0

10,0.5968,234.3481,1.0

10,0.6453,237.686,1.0

10,0.6982,241.0237,1.0

10,0.7567,244.3616,1.0

10,0.8236,247.6994,1.0

10,0.903,251.0372,1.0

10,1.0055,254.3751,1.0

10,1.1567,257.7129,1.0

10,1.429,261.0506,1.0

10,2.001,264.4093,1.0

11,0.8317,0.0,-1.0

11,0.7575,4.0367,-1.0

11,0.7046,8.0733,-1.0

11,0.6499,12.2491,-1.0

11,0.5979,16.2857,-1.0

11,0.5469,20.3223,-1.0

11,0.4958,24.4982,-1.0

11,0.4481,28.5348,-1.0

11,0.4004,32.7106,-1.0

11,0.3565,36.7473,-1.0

11,0.314,40.7838,-1.0

11,0.272,44.9597,-1.0

11,0.2338,48.9964,-1.0

11,0.1988,53.0331,-1.0

11,0.1666,57.2088,-1.0

11,0.1407,61.2455,-1.0

11,0.1185,65.4213,-1.0

11,0.1009,69.4579,-1.0

11,0.086,73.4945,-1.0

11,0.0736,77.6703,-1.0

11,0.0641,81.707,-1.0

11,0.0565,85.7437,-1.0

11,0.0506,89.9195,-1.0

11,0.0462,93.9561,-1.0

11,0.0427,98.132,-1.0

11,0.0397,102.1686,-1.0

11,0.0372,106.2051,-1.0

11,0.0349,110.381,-1.0

11,0.033,114.4176,-1.0

11,0.031,118.5934,-1.0

11,0.0294,122.63,-1.0

11,0.0281,126.6666,-1.0

11,0.0265,130.8425,-1.0

11,0.025,134.8791,-1.0

11,0.0237,138.9156,-1.0

11,0.0223,143.0915,-1.0

11,0.021,147.128,-1.0

11,0.0196,151.3038,-1.0

11,0.0183,155.3404,-1.0

11,0.0169,159.3771,-1.0

11,0.0156,163.5528,-1.0

11,0.0142,167.5895,-1.0

11,0.0128,171.6261,-1.0

11,0.0112,175.8019,-1.0

11,0.0096,179.8385,-1.0

11,0.0077,184.0142,-1.0

11,0.0061,188.0508,-1.0

11,0.0042,192.0874,-1.0

11,0.0017,196.2632,-1.0

11,-0.0001,200.2852,-1.0

11,0.0001,204.1097,-1.0

11,0.0002,207.8111,-1.0

11,-0.0001,211.1459,-1.0

11,-0.0001,214.356,-1.0

11,-0.0001,217.2247,-1.0

11,0.0001,219.8596,-1.0

11,0.0001,222.3504,-1.0

11,0.0001,224.5353,-1.0

11,-0.0001,226.5891,-1.0

11,0.0001,228.3921,-1.0

11,-0.0001,230.0355,-1.0

11,0.0001,231.5773,-1.0

11,-0.0001,232.9276,-1.0

11,0.0001,234.1484,-1.0

11,-0.0001,235.2826,-1.0

11,0.0001,236.2665,-1.0

11,0.0001,237.1891,-1.0

11,-0.0001,238.005,-1.0

11,-0.0001,238.7596,-1.0

11,0.0001,239.4806,-1.0

11,-0.0001,240.1315,-1.0

11,-0.0001,240.7378,-1.0

11,-0.0001,241.3197,-1.0

11,0.0001,241.8487,-1.0

11,-0.0001,242.37,-1.0

11,0.0001,242.8503,-1.0

11,0.0001,243.3119,-1.0

11,0.0001,243.7729,-1.0

11,-0.0001,244.1998,-1.0

11,-0.0002,244.6154,-1.0

11,0.2327,0.0,1.0

11,0.147,3.0598,1.0

11,0.1373,6.1195,1.0

11,0.1323,9.1794,1.0

11,0.1299,12.2392,1.0

11,0.128,15.299,1.0

11,0.1261,18.3588,1.0

11,0.125,21.5577,1.0

11,0.124,24.6174,1.0

11,0.1234,27.6771,1.0

11,0.1229,30.7368,1.0

11,0.1224,33.7966,1.0

11,0.1223,36.8564,1.0

11,0.1218,40.0552,1.0

11,0.1218,43.1149,1.0

11,0.1215,46.1746,1.0

11,0.1213,49.2343,1.0

11,0.1213,52.2941,1.0

11,0.121,55.3537,1.0

11,0.1212,58.5525,1.0

11,0.121,61.6122,1.0

11,0.1212,64.672,1.0

11,0.1212,67.7318,1.0

11,0.1213,70.7915,1.0

11,0.1215,73.8513,1.0

11,0.1215,77.0502,1.0

11,0.1218,80.11,1.0

11,0.122,83.1698,1.0

11,0.1221,86.2295,1.0

11,0.1226,89.2892,1.0

11,0.1227,92.349,1.0

11,0.1231,95.5478,1.0

11,0.1234,98.6076,1.0

11,0.124,101.6674,1.0

11,0.1243,104.7271,1.0

11,0.1248,107.7869,1.0

11,0.1254,110.8467,1.0

11,0.1262,114.0455,1.0

11,0.1269,117.1053,1.0

11,0.1275,120.1651,1.0

11,0.1284,123.2248,1.0

11,0.1294,126.2845,1.0

11,0.1304,129.3442,1.0

11,0.1319,132.5431,1.0

11,0.1334,135.6028,1.0

11,0.1349,138.6626,1.0

11,0.137,141.7223,1.0

11,0.1395,144.782,1.0

11,0.1424,147.8417,1.0

11,0.1462,151.0405,1.0

11,0.1505,154.1002,1.0

11,0.1557,157.16,1.0

11,0.162,160.2197,1.0

11,0.1697,163.2794,1.0

11,0.1787,166.3392,1.0

11,0.1899,169.538,1.0

11,0.2029,172.5976,1.0

11,0.2182,175.6574,1.0

11,0.2367,178.717,1.0

11,0.2579,181.7768,1.0

11,0.2819,184.8365,1.0

11,0.3091,188.0353,1.0

11,0.3372,191.095,1.0

11,0.3668,194.1548,1.0

11,0.398,197.2145,1.0

11,0.4312,200.2742,1.0

11,0.4657,203.3339,1.0

11,0.5041,206.5326,1.0

11,0.5427,209.5924,1.0

11,0.5835,212.652,1.0

11,0.6269,215.7117,1.0

11,0.6737,218.7714,1.0

11,0.7245,221.8311,1.0

11,0.784,225.0299,1.0

11,0.8488,228.0897,1.0

11,0.9269,231.1494,1.0

11,1.028,234.2091,1.0

11,1.1783,237.2688,1.0

11,1.4428,240.3285,1.0

11,2.0005,243.5272,1.0

12,0.8306,0.0,-1.0

12,0.7602,3.7582,-1.0

12,0.7107,7.5165,-1.0

12,0.6596,11.4138,-1.0

12,0.6109,15.1719,-1.0

12,0.5614,19.0692,-1.0

12,0.515,22.8274,-1.0

12,0.4679,26.7247,-1.0

12,0.4244,30.4829,-1.0

12,0.3808,34.3802,-1.0

12,0.3402,38.1383,-1.0

12,0.2999,42.0356,-1.0

12,0.2627,45.7938,-1.0

12,0.2262,49.6912,-1.0

12,0.1937,53.4494,-1.0

12,0.1644,57.3467,-1.0

12,0.1399,61.1048,-1.0

12,0.1188,65.0022,-1.0

12,0.1021,68.7603,-1.0

12,0.0874,72.6577,-1.0

12,0.0755,76.4159,-1.0

12,0.0657,80.3132,-1.0

12,0.0582,84.0714,-1.0

12,0.0519,87.9687,-1.0

12,0.0473,91.7268,-1.0

12,0.0435,95.6241,-1.0

12,0.0403,99.3823,-1.0

12,0.0375,103.2796,-1.0

12,0.0353,107.0377,-1.0

12,0.0334,110.935,-1.0

12,0.0315,114.6931,-1.0

12,0.0296,118.5905,-1.0

12,0.028,122.3487,-1.0

12,0.0264,126.246,-1.0

12,0.0251,130.0041,-1.0

12,0.0235,133.9015,-1.0

12,0.0223,137.6596,-1.0

12,0.0208,141.557,-1.0

12,0.0194,145.3151,-1.0

12,0.018,149.2125,-1.0

12,0.0164,152.9707,-1.0

12,0.015,156.868,-1.0

12,0.0137,160.6261,-1.0

12,0.012,164.5235,-1.0

12,0.0102,168.2817,-1.0

12,0.0083,172.1791,-1.0

12,0.0063,175.9372,-1.0

12,0.004,179.8346,-1.0

12,0.0013,183.5928,-1.0

12,-0.0001,187.4555,-1.0

12,0.0001,190.9522,-1.0

12,0.0001,194.3259,-1.0

12,-0.0001,197.3378,-1.0

12,0.0001,200.2199,-1.0

12,-0.0001,202.7764,-1.0

12,-0.0001,205.2136,-1.0

12,0.0001,207.3611,-1.0

12,-0.0001,209.3942,-1.0

12,-0.0001,211.1871,-1.0

12,-0.0001,212.8716,-1.0

12,0.0001,214.3347,-1.0

12,0.0001,215.7129,-1.0

12,-0.0001,216.9215,-1.0

12,-0.0001,218.0634,-1.0

12,-0.0001,219.0663,-1.0

12,-0.0001,220.0156,-1.0

12,0.0001,220.855,-1.0

12,0.0001,221.646,-1.0

12,0.0001,222.343,-1.0

12,-0.0001,223.0206,-1.0

12,0.0001,223.634,-1.0

12,-0.0001,224.2422,-1.0

12,0.0001,224.799,-1.0

12,-0.0001,225.3416,-1.0

12,-0.0001,225.8303,-1.0

12,0.0001,226.3061,-1.0

12,-0.0001,226.7351,-1.0

12,-0.0001,227.1583,-1.0

12,-0.0001,227.5591,-1.0

12,0.0001,227.9555,-1.0

12,0.2464,0.0,1.0

12,0.1505,2.7816,1.0

12,0.1386,5.7023,1.0

12,0.1345,8.6231,1.0

12,0.1315,11.4047,1.0

12,0.1296,14.3255,1.0

12,0.1281,17.2461,1.0

12,0.127,20.0278,1.0

12,0.1258,22.9484,1.0

12,0.1254,25.8692,1.0

12,0.125,28.6508,1.0

12,0.124,31.5715,1.0

12,0.1237,34.4922,1.0

12,0.1235,37.2737,1.0

12,0.1232,40.1944,1.0

12,0.1227,43.1151,1.0

12,0.1227,45.8967,1.0

12,0.1226,48.8174,1.0

12,0.1224,51.7381,1.0

12,0.1224,54.5197,1.0

12,0.1224,57.4405,1.0

12,0.1226,60.3611,1.0

12,0.1226,63.1426,1.0

12,0.1226,66.0633,1.0

12,0.1227,68.9839,1.0

12,0.1227,71.7656,1.0

12,0.1232,74.6862,1.0

12,0.1234,77.6068,1.0

12,0.1235,80.3884,1.0

12,0.124,83.3091,1.0

12,0.1243,86.2298,1.0

12,0.1246,89.0113,1.0

12,0.125,91.932,1.0

12,0.1254,94.8527,1.0

12,0.1262,97.6343,1.0

12,0.1267,100.555,1.0

12,0.1275,103.4756,1.0

12,0.1281,106.2572,1.0

12,0.1291,109.178,1.0

12,0.13,112.0986,1.0

12,0.131,114.8802,1.0

12,0.1323,117.801,1.0

12,0.1335,120.7216,1.0

12,0.1354,123.5032,1.0

12,0.1373,126.4239,1.0

12,0.1395,129.3446,1.0

12,0.1422,132.1262,1.0

12,0.1457,135.0469,1.0

12,0.1498,137.9675,1.0

12,0.1543,140.7492,1.0

12,0.1603,143.6698,1.0

12,0.1674,146.5904,1.0

12,0.1754,149.3721,1.0

12,0.1852,152.2927,1.0

12,0.1969,155.2134,1.0

12,0.2099,157.995,1.0

12,0.2261,160.9157,1.0

12,0.2449,163.8363,1.0

12,0.266,166.618,1.0

12,0.2898,169.5387,1.0

12,0.3156,172.4593,1.0

12,0.3418,175.2409,1.0

12,0.3709,178.1616,1.0

12,0.4009,181.0822,1.0

12,0.4312,183.8638,1.0

12,0.4644,186.7844,1.0

12,0.4993,189.705,1.0

12,0.5342,192.4866,1.0

12,0.5725,195.4072,1.0

12,0.6136,198.3278,1.0

12,0.655,201.1093,1.0

12,0.7019,204.0299,1.0

12,0.7531,206.9506,1.0

12,0.8074,209.7321,1.0

12,0.8732,212.6527,1.0

12,0.9531,215.5733,1.0

12,1.0528,218.3548,1.0

12,1.2094,221.2754,1.0

12,1.4881,224.196,1.0

12,2.0001,226.9983,1.0

13,0.7496,0.0,-1.0

13,0.6852,3.8963,-1.0

13,0.6418,7.7926,-1.0

13,0.5935,11.9672,-1.0

13,0.5477,15.8635,-1.0

13,0.5019,19.7597,-1.0

13,0.453,23.9342,-1.0

13,0.409,27.8304,-1.0

13,0.3625,32.005,-1.0

13,0.3209,35.9012,-1.0

13,0.2806,39.7974,-1.0

13,0.2392,43.9719,-1.0

13,0.2023,47.8681,-1.0

13,0.1679,51.7644,-1.0

13,0.1346,55.9389,-1.0

13,0.1088,59.8352,-1.0

13,0.086,64.0097,-1.0

13,0.0684,67.9059,-1.0

13,0.0536,71.8021,-1.0

13,0.0406,75.9767,-1.0

13,0.0307,79.8729,-1.0

13,0.0229,83.769,-1.0

13,0.0162,87.9436,-1.0

13,0.0112,91.8397,-1.0

13,0.0066,96.0142,-1.0

13,0.0032,99.9104,-1.0

13,0.0001,103.8066,-1.0

13,0.0001,107.8698,-1.0

13,0.0001,111.5025,-1.0

13,-0.0001,115.256,-1.0

13,-0.0001,118.6462,-1.0

13,-0.0001,121.9387,-1.0

13,-0.0001,125.3648,-1.0

13,-0.0001,128.4755,-1.0

13,-0.0001,131.5046,-1.0

13,0.0001,134.6618,-1.0

13,-0.0001,137.5295,-1.0

13,-0.0001,140.5218,-1.0

13,0.0001,143.242,-1.0

13,0.0001,145.8943,-1.0

13,-0.0002,148.6607,-1.0

13,-0.0001,151.1726,-1.0

13,0.0001,153.6111,-1.0

13,0.0001,156.1413,-1.0

13,0.0002,158.4371,-1.0

13,0.0001,160.8257,-1.0

13,-0.0002,162.9863,-1.0

13,-0.0001,165.0788,-1.0

13,0.0002,167.248,-1.0

13,0.0001,169.2023,-1.0

13,0.0001,171.0909,-1.0

13,-0.0001,173.0358,-1.0

13,-0.0001,174.785,-1.0

13,0.0001,176.5822,-1.0

13,-0.0001,178.191,-1.0

13,-0.0001,179.7381,-1.0

13,-0.0001,181.3234,-1.0

13,0.0002,182.7321,-1.0

13,0.0002,184.1709,-1.0

13,0.0001,185.4495,-1.0

13,-0.0002,186.6703,-1.0

13,-0.0001,187.9185,-1.0

13,0.0001,189.0288,-1.0

13,-0.0001,190.083,-1.0

13,0.0001,191.1503,-1.0

13,0.0001,192.0943,-1.0

13,0.0001,193.0483,-1.0

13,-0.0001,193.8917,-1.0

13,-0.0001,194.6866,-1.0

13,0.0001,195.4925,-1.0

13,-0.0001,196.2032,-1.0

13,0.0002,196.8777,-1.0

13,-0.0001,197.5587,-1.0

13,-0.0001,198.1545,-1.0

13,-0.0001,198.7452,-1.0

13,0.0001,199.2602,-1.0

13,0.0001,199.7416,-1.0

13,0.0001,200.2185,-1.0

13,0.0001,200.64,-1.0

13,0.0001,201.046,-1.0

13,0.277,0.0,1.0

13,0.2004,2.2253,1.0

13,0.1879,4.7287,1.0

13,0.1831,7.2321,1.0

13,0.1796,9.7355,1.0

13,0.1774,12.239,1.0

13,0.1757,14.7424,1.0

13,0.1741,17.2458,1.0

13,0.1727,19.7492,1.0

13,0.1717,22.2526,1.0

13,0.1706,24.756,1.0

13,0.17,27.2594,1.0

13,0.169,29.7628,1.0

13,0.1685,32.2662,1.0

13,0.1681,34.7697,1.0

13,0.1678,37.2731,1.0

13,0.1674,39.7765,1.0

13,0.1671,42.2799,1.0

13,0.1668,44.7834,1.0

13,0.1666,47.2868,1.0

13,0.1666,49.7902,1.0

13,0.1665,52.2936,1.0

13,0.1662,54.797,1.0

13,0.1663,57.3004,1.0

13,0.1662,59.8038,1.0

13,0.1663,62.3072,1.0

13,0.1665,64.8106,1.0

13,0.1666,67.314,1.0

13,0.1668,69.8174,1.0

13,0.1673,72.3208,1.0

13,0.1679,74.8242,1.0

13,0.1681,77.3276,1.0

13,0.1687,79.831,1.0

13,0.1695,82.3344,1.0

13,0.1704,84.8378,1.0

13,0.1714,87.3412,1.0

13,0.1724,89.8445,1.0

13,0.1736,92.3479,1.0

13,0.1752,94.8514,1.0

13,0.1768,97.3548,1.0

13,0.1782,99.58,1.0

13,0.1804,102.0835,1.0

13,0.183,104.5868,1.0

13,0.1858,107.0902,1.0

13,0.189,109.5936,1.0

13,0.1928,112.0969,1.0

13,0.1972,114.6003,1.0

13,0.202,117.1037,1.0

13,0.208,119.6071,1.0

13,0.2147,122.1105,1.0

13,0.2223,124.6138,1.0

13,0.2312,127.1172,1.0

13,0.2416,129.6206,1.0

13,0.2535,132.124,1.0

13,0.267,134.6274,1.0

13,0.2828,137.1308,1.0

13,0.3004,139.6342,1.0

13,0.3199,142.1376,1.0

13,0.3413,144.641,1.0

13,0.3638,147.1444,1.0

13,0.3877,149.6478,1.0

13,0.4129,152.1512,1.0

13,0.4392,154.6547,1.0

13,0.4667,157.158,1.0

13,0.4957,159.6614,1.0

13,0.5259,162.1647,1.0

13,0.5575,164.6681,1.0

13,0.5909,167.1715,1.0

13,0.6261,169.6749,1.0

13,0.6638,172.1783,1.0

13,0.7041,174.6817,1.0

13,0.7481,177.185,1.0

13,0.7973,179.6884,1.0

13,0.8531,182.1918,1.0

13,0.9188,184.6952,1.0

13,1.0002,187.1986,1.0

13,1.1082,189.702,1.0

13,1.2693,192.2053,1.0

13,1.5392,194.7087,1.0

13,2.0028,197.1285,1.0

14,0.7158,0.0,-1.0

14,0.6622,3.3397,-1.0

14,0.6212,6.9576,-1.0

14,0.5789,10.5755,-1.0

14,0.5362,14.1934,-1.0

14,0.4935,17.8113,-1.0

14,0.4515,21.4292,-1.0

14,0.4099,25.0471,-1.0

14,0.37,28.665,-1.0

14,0.3307,32.2829,-1.0

14,0.2926,35.9007,-1.0

14,0.2557,39.5186,-1.0

14,0.2207,43.1365,-1.0

14,0.1871,46.7544,-1.0

14,0.1557,50.3723,-1.0

14,0.1278,53.9901,-1.0

14,0.1039,57.608,-1.0

14,0.0841,61.2259,-1.0

14,0.0676,64.8438,-1.0

14,0.0536,68.4617,-1.0

14,0.0419,72.0796,-1.0

14,0.0321,75.6974,-1.0

14,0.0243,79.3153,-1.0

14,0.0178,82.9331,-1.0

14,0.0124,86.551,-1.0

14,0.008,90.1689,-1.0

14,0.0042,93.7868,-1.0

14,0.0007,97.4047,-1.0

14,0.0001,100.9897,-1.0

14,-0.0001,104.3898,-1.0

14,0.0001,107.6568,-1.0

14,0.0001,110.8071,-1.0

14,0.0001,113.8485,-1.0

14,0.0001,116.7922,-1.0

14,0.0001,119.6461,-1.0

14,0.0001,122.4169,-1.0

14,0.0001,125.1046,-1.0

14,-0.0002,127.7128,-1.0

14,0.0001,130.2434,-1.0

14,0.0001,132.6995,-1.0

14,-0.0001,134.902,-1.0

14,-0.0001,137.2135,-1.0

14,0.0001,139.4498,-1.0

14,-0.0001,141.6127,-1.0

14,-0.0001,143.7001,-1.0

14,0.0001,145.7165,-1.0

14,0.0001,147.6631,-1.0

14,0.0001,149.5383,-1.0

14,0.0001,151.3443,-1.0

14,0.0001,153.0794,-1.0

14,0.0001,154.7441,-1.0

14,0.0001,156.3442,-1.0

14,-0.0002,157.8831,-1.0

14,0.0001,159.3616,-1.0

14,0.0001,160.7727,-1.0

14,0.0001,162.117,-1.0

14,0.0001,163.3984,-1.0

14,-0.0001,164.6167,-1.0

14,0.0001,165.7725,-1.0

14,-0.0001,166.872,-1.0

14,-0.0001,167.9177,-1.0

14,-0.0001,168.9097,-1.0

14,-0.0001,169.8435,-1.0

14,-0.0001,170.728,-1.0

14,-0.0001,171.5639,-1.0

14,-0.0001,172.349,-1.0

14,-0.0001,173.0923,-1.0

14,-0.0001,173.7893,-1.0

14,-0.0001,174.439,-1.0

14,0.0001,175.0509,-1.0

14,0.0001,175.6298,-1.0

14,-0.0001,176.1715,-1.0

14,-0.0001,176.6811,-1.0

14,-0.0002,177.1668,-1.0

14,0.0001,177.6308,-1.0

14,0.0001,178.0715,-1.0

14,0.0001,178.4898,-1.0

14,0.0002,178.8913,-1.0

14,0.0001,179.2753,-1.0

14,-0.0001,179.6238,-1.0

14,0.2749,0.0,1.0

14,0.2039,2.2252,1.0

14,0.1923,4.4505,1.0

14,0.1868,6.6757,1.0

14,0.1836,8.901,1.0

14,0.1812,11.1262,1.0

14,0.1788,13.3515,1.0

14,0.1771,15.8549,1.0

14,0.176,18.0802,1.0

14,0.1747,20.3054,1.0

14,0.1738,22.5307,1.0

14,0.1731,24.7559,1.0

14,0.1725,26.9812,1.0

14,0.1717,29.2064,1.0

14,0.1712,31.7098,1.0

14,0.1703,33.9351,1.0

14,0.1701,36.1603,1.0

14,0.17,38.3856,1.0

14,0.1697,40.6108,1.0

14,0.1695,42.8361,1.0

14,0.1693,45.3395,1.0

14,0.1693,47.5647,1.0

14,0.1693,49.79,1.0

14,0.1693,52.0152,1.0

14,0.1695,54.2405,1.0

14,0.1697,56.4657,1.0

14,0.17,58.691,1.0

14,0.1701,61.1944,1.0

14,0.1706,63.4196,1.0

14,0.1711,65.6449,1.0

14,0.1717,67.8702,1.0

14,0.1725,70.0954,1.0

14,0.1733,72.3207,1.0

14,0.1744,74.8241,1.0

14,0.1757,77.0494,1.0

14,0.1769,79.2746,1.0

14,0.1787,81.4998,1.0

14,0.1801,83.7251,1.0

14,0.1822,85.9503,1.0

14,0.1846,88.1756,1.0

14,0.1876,90.679,1.0

14,0.1906,92.9042,1.0

14,0.1941,95.1295,1.0

14,0.1982,97.3547,1.0

14,0.2023,99.58,1.0

14,0.2079,101.8052,1.0

14,0.2139,104.0304,1.0

14,0.2213,106.5338,1.0

14,0.2291,108.759,1.0

14,0.238,110.9843,1.0

14,0.2481,113.2096,1.0

14,0.2597,115.4348,1.0

14,0.2724,117.66,1.0

14,0.2888,120.1635,1.0

14,0.3052,122.3887,1.0

14,0.3234,124.614,1.0

14,0.3424,126.8392,1.0

14,0.3629,129.0644,1.0

14,0.3843,131.2897,1.0

14,0.4064,133.5149,1.0

14,0.4324,136.0183,1.0

14,0.457,138.2435,1.0

14,0.4822,140.4687,1.0

14,0.5085,142.6939,1.0

14,0.5359,144.9191,1.0

14,0.5643,147.1444,1.0

14,0.5977,149.6478,1.0

14,0.6298,151.873,1.0

14,0.663,154.0984,1.0

14,0.6985,156.3236,1.0

14,0.7371,158.5488,1.0

14,0.7792,160.7741,1.0

14,0.8258,162.9993,1.0

14,0.8862,165.5027,1.0

14,0.9501,167.728,1.0

14,1.0292,169.9532,1.0

14,1.1339,172.1784,1.0

14,1.2856,174.4036,1.0

14,1.5295,176.6288,1.0

14,2.0018,179.1044,1.0

15,0.7136,0.0,-1.0

15,0.6592,3.3397,-1.0

15,0.6215,6.6794,-1.0

15,0.5828,10.0191,-1.0

15,0.5434,13.3587,-1.0

15,0.5009,16.9767,-1.0

15,0.4616,20.3163,-1.0

15,0.4232,23.6559,-1.0

15,0.3855,26.9955,-1.0

15,0.3459,30.6134,-1.0

15,0.3101,33.9531,-1.0

15,0.2754,37.2927,-1.0

15,0.2422,40.6323,-1.0

15,0.2074,44.2502,-1.0

15,0.1768,47.5899,-1.0

15,0.1481,50.9295,-1.0

15,0.1226,54.2691,-1.0

15,0.0993,57.8871,-1.0

15,0.0809,61.2267,-1.0

15,0.0655,64.5663,-1.0

15,0.0522,67.9059,-1.0

15,0.0402,71.5238,-1.0

15,0.0305,74.8634,-1.0

15,0.0227,78.203,-1.0

15,0.0162,81.5427,-1.0

15,0.0102,85.1607,-1.0

15,0.0055,88.5003,-1.0

15,0.0015,91.8399,-1.0

15,-0.0001,95.1342,-1.0

15,-0.0001,98.2595,-1.0

15,0.0001,101.4844,-1.0

15,0.0001,104.3374,-1.0

15,-0.0001,107.0852,-1.0

15,0.0001,109.7365,-1.0

15,0.0001,112.5016,-1.0

15,-0.0001,114.9589,-1.0

15,0.0001,117.3227,-1.0

15,0.0002,119.6065,-1.0

15,-0.0001,121.994,-1.0

15,0.0001,124.1174,-1.0

15,-0.0001,126.1686,-1.0

15,0.0001,128.1458,-1.0

15,-0.0001,130.2077,-1.0

15,0.0001,132.0343,-1.0

15,0.0001,133.7891,-1.0

15,-0.0001,135.4751,-1.0

15,-0.0001,137.224,-1.0

15,0.0001,138.7715,-1.0

15,-0.0001,140.2494,-1.0

15,0.0001,141.6609,-1.0

15,0.0001,143.1223,-1.0

15,-0.0001,144.4075,-1.0

15,-0.0001,145.6367,-1.0

15,-0.0001,146.8026,-1.0

15,0.0001,147.9103,-1.0

15,0.0001,149.0516,-1.0

15,-0.0001,150.0556,-1.0

15,-0.0001,151.0113,-1.0

15,0.0001,151.915,-1.0

15,0.0001,152.834,-1.0

15,-0.0001,153.6356,-1.0

15,0.0001,154.395,-1.0

15,-0.0002,155.1117,-1.0

15,0.0001,155.8454,-1.0

15,0.0001,156.4813,-1.0

15,-0.0001,157.0798,-1.0

15,0.0002,157.6519,-1.0

15,-0.0002,158.242,-1.0

15,0.0001,158.7655,-1.0

15,0.0001,159.2657,-1.0

15,0.0001,159.7361,-1.0

15,0.0001,160.2196,-1.0

15,-0.0001,160.646,-1.0

15,0.0001,161.0529,-1.0

15,-0.0001,161.4436,-1.0

15,0.0001,161.8527,-1.0

15,-0.0001,162.2162,-1.0

15,-0.0001,162.5691,-1.0

15,0.0001,162.9145,-1.0

15,-0.0001,163.2658,-1.0

15,0.2846,0.0,1.0

15,0.2075,1.9471,1.0

15,0.1971,3.8942,1.0

15,0.1909,6.1195,1.0

15,0.1879,8.0666,1.0

15,0.1846,10.2919,1.0

15,0.1823,12.2389,1.0

15,0.1809,14.186,1.0

15,0.1796,16.4113,1.0

15,0.1785,18.3584,1.0

15,0.1776,20.5837,1.0

15,0.1769,22.5308,1.0

15,0.1758,24.7561,1.0

15,0.1754,26.7032,1.0

15,0.1747,28.6503,1.0

15,0.1744,30.8756,1.0

15,0.1743,32.8227,1.0

15,0.1736,35.0479,1.0

15,0.1735,36.995,1.0

15,0.1735,38.9421,1.0

15,0.1735,41.1674,1.0

15,0.1733,43.1145,1.0

15,0.1736,45.3397,1.0

15,0.1736,47.2868,1.0

15,0.1739,49.5121,1.0

15,0.1744,51.4592,1.0

15,0.1749,53.4062,1.0

15,0.1754,55.6315,1.0

15,0.1762,57.5785,1.0

15,0.1769,59.8037,1.0

15,0.1781,61.7508,1.0

15,0.1792,63.6979,1.0

15,0.1806,65.9231,1.0

15,0.1819,67.8702,1.0

15,0.1838,70.0954,1.0

15,0.1858,72.0426,1.0

15,0.1885,74.2678,1.0

15,0.1909,76.2149,1.0

15,0.1937,78.162,1.0

15,0.1974,80.3873,1.0

15,0.2012,82.3344,1.0

15,0.2061,84.5596,1.0

15,0.211,86.5067,1.0

15,0.2161,88.4538,1.0

15,0.2232,90.679,1.0

15,0.23,92.6261,1.0

15,0.2389,94.8514,1.0

15,0.2476,96.7985,1.0

15,0.259,99.0237,1.0

15,0.2698,100.9708,1.0

15,0.2823,102.9179,1.0

15,0.298,105.1431,1.0

15,0.3131,107.0902,1.0

15,0.3316,109.3155,1.0

15,0.3491,111.2626,1.0

15,0.3671,113.2097,1.0

15,0.3885,115.4349,1.0

15,0.4085,117.382,1.0

15,0.4316,119.6073,1.0

15,0.4529,121.5544,1.0

15,0.4781,123.7796,1.0

15,0.5011,125.7267,1.0

15,0.5247,127.6738,1.0

15,0.5524,129.899,1.0

15,0.5782,131.846,1.0

15,0.6085,134.0713,1.0

15,0.6367,136.0183,1.0

15,0.6662,137.9654,1.0

15,0.702,140.1906,1.0

15,0.7353,142.1377,1.0

15,0.777,144.3629,1.0

15,0.8174,146.31,1.0

15,0.8689,148.5352,1.0

15,0.9211,150.4823,1.0

15,0.9827,152.4294,1.0

15,1.0712,154.6546,1.0

15,1.1748,156.6016,1.0

15,1.3487,158.8268,1.0

15,1.5912,160.7739,1.0

15,2.0026,162.8322,1.0

16,0.8995,0.0,-1.0

16,0.797,4.8255,-1.0

16,0.7172,9.6593,-1.0

16,0.6447,14.4931,-1.0

16,0.5775,19.3186,-1.0

16,0.5147,24.1524,-1.0

16,0.4556,28.9862,-1.0

16,0.4004,33.82,-1.0

16,0.3484,38.6455,-1.0

16,0.3006,43.4793,-1.0

16,0.2557,48.313,-1.0

16,0.2139,53.1385,-1.0

16,0.1779,57.9722,-1.0

16,0.1503,62.806,-1.0

16,0.1292,67.6398,-1.0

16,0.1129,72.4652,-1.0

16,0.0998,77.299,-1.0

16,0.0901,82.1328,-1.0

16,0.0833,86.9582,-1.0

16,0.0782,91.792,-1.0

16,0.0742,96.6258,-1.0

16,0.0714,101.4596,-1.0

16,0.069,106.285,-1.0

16,0.0666,111.1188,-1.0

16,0.0649,115.9526,-1.0

16,0.0632,120.7863,-1.0

16,0.0616,125.6118,-1.0

16,0.06,130.4455,-1.0

16,0.0582,135.2793,-1.0

16,0.0563,140.1048,-1.0

16,0.0543,144.9385,-1.0

16,0.0521,149.7723,-1.0

16,0.049,154.6061,-1.0

16,0.0446,159.4315,-1.0

16,0.0381,164.2653,-1.0

16,0.0307,169.0991,-1.0

16,0.0251,173.9246,-1.0

16,0.0216,178.7583,-1.0

16,0.0192,183.5921,-1.0

16,0.0175,188.4259,-1.0

16,0.0161,193.2513,-1.0

16,0.015,198.085,-1.0

16,0.0137,202.9188,-1.0

16,0.0126,207.7526,-1.0

16,0.0113,212.578,-1.0

16,0.0102,217.4117,-1.0

16,0.0091,222.2455,-1.0

16,0.008,227.0709,-1.0

16,0.0067,231.9046,-1.0

16,0.0055,236.7384,-1.0

16,0.0042,241.5721,-1.0

16,0.0029,246.3975,-1.0

16,0.0017,251.2312,-1.0

16,0.0001,256.0668,-1.0

16,-0.0002,260.8008,-1.0

16,-0.0001,265.3453,-1.0

16,-0.0001,269.6969,-1.0

16,0.0001,273.8589,-1.0

16,-0.0001,277.8188,-1.0

16,-0.0001,281.5904,-1.0

16,0.0001,285.1661,-1.0

16,0.0001,288.5488,-1.0

16,-0.0001,291.7319,-1.0

16,-0.0001,294.742,-1.0

16,-0.0001,297.6932,-1.0

16,-0.0001,300.2761,-1.0

16,0.0001,302.6549,-1.0

16,-0.0002,304.844,-1.0

16,-0.0001,306.8415,-1.0

16,-0.0001,308.6469,-1.0

16,-0.0001,310.2724,-1.0

16,0.0001,311.7238,-1.0

16,-0.0001,313.0093,-1.0

16,0.0001,314.1465,-1.0

16,0.0001,315.148,-1.0

16,-0.0001,316.0257,-1.0

16,-0.0001,316.7932,-1.0

16,-0.0001,317.4662,-1.0

16,-0.0001,318.056,-1.0

16,-0.0001,318.5724,-1.0

16,0.0383,0.0,1.0

16,0.0356,4.1901,1.0

16,0.0359,8.3802,1.0

16,0.0399,12.5786,1.0

16,0.0444,16.7687,1.0

16,0.0495,20.9671,1.0

16,0.0543,25.1571,1.0

16,0.0582,29.3555,1.0

16,0.0616,33.5456,1.0

16,0.0641,37.744,1.0

16,0.066,41.934,1.0

16,0.0674,46.1324,1.0

16,0.0687,50.3224,1.0

16,0.0698,54.5208,1.0

16,0.0704,58.7108,1.0

16,0.0712,62.9092,1.0

16,0.072,67.0992,1.0

16,0.0727,71.2892,1.0

16,0.0733,75.4875,1.0

16,0.0739,79.6775,1.0

16,0.0742,83.8759,1.0

16,0.075,88.0659,1.0

16,0.0755,92.2642,1.0

16,0.0758,96.4542,1.0

16,0.0763,100.6525,1.0

16,0.0768,104.8425,1.0

16,0.0773,109.0408,1.0

16,0.0777,113.2308,1.0

16,0.0782,117.4291,1.0

16,0.0787,121.6191,1.0

16,0.0792,125.8175,1.0

16,0.0796,130.0075,1.0

16,0.0801,134.1974,1.0

16,0.0806,138.3958,1.0

16,0.0811,142.5857,1.0

16,0.0815,146.7841,1.0

16,0.0819,150.974,1.0

16,0.0825,155.1724,1.0

16,0.0831,159.3624,1.0

16,0.0838,163.5607,1.0

16,0.0842,167.7507,1.0

16,0.0849,171.9491,1.0

16,0.0855,176.1391,1.0

16,0.0863,180.3375,1.0

16,0.0869,184.5276,1.0

16,0.0879,188.726,1.0

16,0.0887,192.9161,1.0

16,0.0898,197.1145,1.0

16,0.0907,201.3046,1.0

16,0.092,205.4947,1.0

16,0.0936,209.6931,1.0

16,0.0952,213.8832,1.0

16,0.0974,218.0816,1.0

16,0.1001,222.2717,1.0

16,0.1037,226.4701,1.0

16,0.1099,230.6602,1.0

16,0.1191,234.8586,1.0

16,0.1315,239.0486,1.0

16,0.1473,243.247,1.0

16,0.1671,247.4371,1.0

16,0.1926,251.6355,1.0

16,0.2239,255.8256,1.0

16,0.2603,260.024,1.0

16,0.3003,264.2141,1.0

16,0.3426,268.4041,1.0

16,0.3876,272.6026,1.0

16,0.435,276.7926,1.0

16,0.4846,280.9911,1.0

16,0.5364,285.1812,1.0

16,0.5906,289.3796,1.0

16,0.6466,293.5697,1.0

16,0.7042,297.7682,1.0

16,0.763,301.9583,1.0

16,0.8226,306.1567,1.0

16,0.8835,310.3468,1.0

16,0.9491,314.5453,1.0

16,1.0241,318.7354,1.0

16,1.1227,322.9338,1.0

16,1.3214,327.1239,1.0

16,2.0002,331.3181,1.0

17,1.1903,0.0,-1.0

17,1.0209,4.6918,-1.0

17,0.9272,9.3836,-1.0

17,0.8439,14.0754,-1.0

17,0.7678,18.7672,-1.0

17,0.6966,23.4589,-1.0

17,0.6298,28.1507,-1.0

17,0.567,32.8425,-1.0

17,0.5076,37.5426,-1.0

17,0.4519,42.2344,-1.0

17,0.3995,46.9262,-1.0

17,0.3513,51.618,-1.0

17,0.3069,56.3098,-1.0

17,0.2667,61.0016,-1.0

17,0.2283,65.6935,-1.0

17,0.1923,70.3936,-1.0

17,0.1635,75.0855,-1.0

17,0.1407,79.7773,-1.0

17,0.1226,84.4692,-1.0

17,0.1083,89.161,-1.0

17,0.0971,93.8529,-1.0

17,0.0887,98.5448,-1.0

17,0.0823,103.245,-1.0

17,0.0777,107.9369,-1.0

17,0.0742,112.6287,-1.0

17,0.0714,117.3206,-1.0

17,0.0692,122.0125,-1.0

17,0.0674,126.7044,-1.0

17,0.0654,131.3963,-1.0

17,0.0641,136.0965,-1.0

17,0.0625,140.7884,-1.0

17,0.0611,145.4803,-1.0

17,0.0601,150.1723,-1.0

17,0.059,154.8642,-1.0

17,0.0578,159.5561,-1.0

17,0.0567,164.248,-1.0

17,0.0559,168.9483,-1.0

17,0.0548,173.6402,-1.0

17,0.0536,178.3321,-1.0

17,0.0527,183.024,-1.0

17,0.0517,187.7159,-1.0

17,0.0508,192.4079,-1.0

17,0.05,197.0998,-1.0

17,0.049,201.7917,-1.0

17,0.0478,206.492,-1.0

17,0.047,211.1839,-1.0

17,0.046,215.8758,-1.0

17,0.0449,220.5678,-1.0

17,0.0441,225.2597,-1.0

17,0.0427,229.9516,-1.0

17,0.0419,234.6435,-1.0

17,0.041,239.3438,-1.0

17,0.0397,244.0357,-1.0

17,0.0386,248.7276,-1.0

17,0.0373,253.4195,-1.0

17,0.0362,258.1114,-1.0

17,0.0349,262.8034,-1.0

17,0.0337,267.4953,-1.0

17,0.0319,272.1956,-1.0

17,0.0305,276.8875,-1.0

17,0.0291,281.5794,-1.0

17,0.027,286.2713,-1.0

17,0.0251,290.9632,-1.0

17,0.0229,295.6552,-1.0

17,0.0204,300.3471,-1.0

17,0.0173,305.0474,-1.0

17,0.0132,309.7393,-1.0

17,0.008,314.4312,-1.0

17,-0.0001,319.1231,-1.0

17,0.0001,322.6413,-1.0

17,-0.0001,325.0467,-1.0

17,-0.0001,326.8895,-1.0

17,-0.0001,328.3754,-1.0

17,-0.0001,329.5981,-1.0

17,0.0001,330.6374,-1.0

17,-0.0001,331.5279,-1.0

17,-0.0001,332.2956,-1.0

17,0.0001,332.961,-1.0

17,-0.0001,333.5385,-1.0

17,-0.0001,334.0421,-1.0

17,0.0327,0.0,1.0

17,0.0302,4.1902,1.0

17,0.0318,8.3887,1.0

17,0.0356,12.5871,1.0

17,0.0408,16.7856,1.0

17,0.0464,20.9841,1.0

17,0.0514,25.1826,1.0

17,0.0559,29.3811,1.0

17,0.0593,33.5795,1.0

17,0.0619,37.778,1.0

17,0.0641,41.9765,1.0

17,0.0658,46.175,1.0

17,0.067,50.3734,1.0

17,0.0682,54.5719,1.0

17,0.0692,58.7704,1.0

17,0.0698,62.9688,1.0

17,0.0708,67.1673,1.0

17,0.0714,71.3657,1.0

17,0.0719,75.5642,1.0

17,0.0727,79.7626,1.0

17,0.0733,83.9611,1.0

17,0.0736,88.1596,1.0

17,0.0744,92.358,1.0

17,0.0747,96.5565,1.0

17,0.0754,100.7549,1.0

17,0.0758,104.9534,1.0

17,0.0763,109.1518,1.0

17,0.0766,113.3419,1.0

17,0.0774,117.5404,1.0

17,0.0777,121.7388,1.0

17,0.078,125.9373,1.0

17,0.0785,130.1358,1.0

17,0.079,134.3343,1.0

17,0.0796,138.5328,1.0

17,0.0801,142.7314,1.0

17,0.0807,146.9299,1.0

17,0.0814,151.1285,1.0

17,0.0819,155.327,1.0

17,0.0825,159.5256,1.0

17,0.083,163.7242,1.0

17,0.0838,167.9227,1.0

17,0.0842,172.1213,1.0

17,0.0849,176.3199,1.0

17,0.0857,180.5184,1.0

17,0.0863,184.717,1.0

17,0.0872,188.9155,1.0

17,0.0882,193.1141,1.0

17,0.0891,197.3126,1.0

17,0.0903,201.5111,1.0

17,0.0912,205.7096,1.0

17,0.0926,209.9082,1.0

17,0.0945,214.1067,1.0

17,0.0964,218.3052,1.0

17,0.0993,222.4953,1.0

17,0.1031,226.6938,1.0

17,0.1083,230.8923,1.0

17,0.117,235.0908,1.0

17,0.1288,239.2893,1.0

17,0.1437,243.4877,1.0

17,0.1624,247.6862,1.0

17,0.1863,251.8847,1.0

17,0.2163,256.0832,1.0

17,0.2518,260.2817,1.0

17,0.2907,264.4802,1.0

17,0.3326,268.6787,1.0

17,0.3773,272.8772,1.0

17,0.4244,277.0756,1.0

17,0.4736,281.2741,1.0

17,0.525,285.4726,1.0

17,0.5789,289.6711,1.0

17,0.635,293.8696,1.0

17,0.693,298.068,1.0

17,0.7526,302.2665,1.0

17,0.8131,306.4649,1.0

17,0.8753,310.6634,1.0

17,0.9415,314.8619,1.0

17,1.017,319.0603,1.0

17,1.1152,323.2588,1.0

17,1.311,327.4572,1.0

17,2.0002,331.6557,1.0

18,1.1921,0.0,-1.0

18,1.0241,4.5918,-1.0

18,0.9323,9.1919,-1.0

18,0.8504,13.792,-1.0

18,0.7754,18.3922,-1.0

18,0.7054,22.9923,-1.0

18,0.6391,27.5924,-1.0

18,0.5767,32.1926,-1.0

18,0.5183,36.7927,-1.0

18,0.4629,41.3929,-1.0

18,0.411,45.993,-1.0

18,0.3624,50.5932,-1.0

18,0.3178,55.1933,-1.0

18,0.277,59.7934,-1.0

18,0.2388,64.3852,-1.0

18,0.2023,68.9854,-1.0

18,0.1717,73.5855,-1.0

18,0.1479,78.1857,-1.0

18,0.1289,82.7858,-1.0

18,0.1139,87.3859,-1.0

18,0.1018,91.9861,-1.0

18,0.0926,96.5862,-1.0

18,0.0855,101.1864,-1.0

18,0.0804,105.7865,-1.0

18,0.0765,110.3867,-1.0

18,0.0733,114.9868,-1.0

18,0.0711,119.587,-1.0

18,0.0692,124.1788,-1.0

18,0.0673,128.7789,-1.0

18,0.0655,133.3791,-1.0

18,0.0641,137.9792,-1.0

18,0.063,142.5794,-1.0

18,0.0617,147.1795,-1.0

18,0.0603,151.7796,-1.0

18,0.0593,156.3798,-1.0

18,0.0584,160.9799,-1.0

18,0.0573,165.58,-1.0

18,0.0562,170.1802,-1.0

18,0.0551,174.7803,-1.0

18,0.0543,179.3804,-1.0

18,0.0533,183.9722,-1.0

18,0.0524,188.5724,-1.0

18,0.0516,193.1725,-1.0

18,0.0505,197.7726,-1.0

18,0.0495,202.3728,-1.0

18,0.0486,206.9729,-1.0

18,0.0478,211.5731,-1.0

18,0.0468,216.1732,-1.0

18,0.0457,220.7733,-1.0

18,0.0448,225.3735,-1.0

18,0.044,229.9736,-1.0

18,0.0427,234.5737,-1.0

18,0.0419,239.1739,-1.0

18,0.041,243.7657,-1.0

18,0.0395,248.3658,-1.0

18,0.0386,252.9659,-1.0

18,0.0375,257.5661,-1.0

18,0.0362,262.1662,-1.0

18,0.0349,266.7663,-1.0

18,0.0337,271.3665,-1.0

18,0.0322,275.9666,-1.0

18,0.0308,280.5668,-1.0

18,0.0294,285.1669,-1.0

18,0.0276,289.767,-1.0

18,0.0257,294.3672,-1.0

18,0.0237,298.9673,-1.0

18,0.0215,303.559,-1.0

18,0.0188,308.1591,-1.0

18,0.0153,312.7593,-1.0

18,0.0108,317.3594,-1.0

18,0.004,321.9596,-1.0

18,0.0001,325.9086,-1.0

18,-0.0002,328.0552,-1.0

18,0.0001,329.5449,-1.0

18,0.0001,330.6859,-1.0

18,-0.0001,331.6204,-1.0

18,0.0001,332.406,-1.0

18,-0.0001,333.0729,-1.0

18,0.0001,333.6452,-1.0

18,-0.0001,334.1398,-1.0

18,0.0264,0.0,1.0

18,0.028,4.1985,1.0

18,0.0305,8.3971,1.0

18,0.0351,12.5956,1.0

18,0.0403,16.7941,1.0

18,0.0457,20.9927,1.0

18,0.0508,25.1912,1.0

18,0.0555,29.398,1.0

18,0.0587,33.5966,1.0

18,0.0614,37.7951,1.0

18,0.0638,41.9936,1.0

18,0.0654,46.1921,1.0

18,0.0668,50.3906,1.0

18,0.0679,54.5892,1.0

18,0.0689,58.796,1.0

18,0.0696,62.9946,1.0

18,0.0706,67.1931,1.0

18,0.0714,71.3916,1.0

18,0.0719,75.5901,1.0

18,0.0723,79.7886,1.0

18,0.0731,83.9955,1.0

18,0.0736,88.194,1.0

18,0.0741,92.3925,1.0

18,0.0747,96.591,1.0

18,0.075,100.7895,1.0

18,0.0758,104.988,1.0

18,0.0761,109.1865,1.0

18,0.0766,113.3934,1.0

18,0.0771,117.5919,1.0

18,0.0776,121.7903,1.0

18,0.078,125.9888,1.0

18,0.0785,130.1873,1.0

18,0.0792,134.3858,1.0

18,0.0796,138.5926,1.0

18,0.0801,142.7911,1.0

18,0.0807,146.9896,1.0

18,0.0812,151.1881,1.0

18,0.0817,155.3865,1.0

18,0.0822,159.585,1.0

18,0.0828,163.7835,1.0

18,0.0834,167.9903,1.0

18,0.0841,172.1888,1.0

18,0.0847,176.3873,1.0

18,0.0855,180.5857,1.0

18,0.0863,184.7842,1.0

18,0.0871,188.9827,1.0

18,0.0879,193.1812,1.0

18,0.0888,197.388,1.0

18,0.0899,201.5865,1.0

18,0.0912,205.7849,1.0

18,0.0925,209.9834,1.0

18,0.0942,214.1819,1.0

18,0.0963,218.3805,1.0

18,0.0988,222.5873,1.0

18,0.1025,226.7858,1.0

18,0.108,230.9843,1.0

18,0.1162,235.1828,1.0

18,0.1277,239.3814,1.0

18,0.1422,243.5799,1.0

18,0.1601,247.7784,1.0

18,0.1838,251.9852,1.0

18,0.2126,256.1838,1.0

18,0.2473,260.3823,1.0

18,0.2863,264.5808,1.0

18,0.3281,268.7794,1.0

18,0.3725,272.9779,1.0

18,0.4194,277.1848,1.0

18,0.4686,281.3833,1.0

18,0.5198,285.5819,1.0

18,0.5735,289.7804,1.0

18,0.6293,293.979,1.0

18,0.6878,298.1775,1.0

18,0.7474,302.3761,1.0

18,0.8087,306.583,1.0

18,0.8716,310.7816,1.0

18,0.9387,314.9801,1.0

18,1.0144,319.1786,1.0

18,1.1128,323.3772,1.0

18,1.3076,327.5757,1.0

18,2.0004,331.7771,1.0`;
}

/* ==========================================
   6. Exporting Utilities
   ========================================== */
function initExportFeatures() {
    // 1st cycle profile download
    btnDownloadProfile.addEventListener('click', () => {
        if (rawBatteryData.length === 0) return;
        downloadChartImage(chartProfileInstance, 'voltage_profile_cycle_' + targetCycleSelect.value);
    });

    // Slope plateau highlight chart download
    btnDownloadSlopeChart.addEventListener('click', () => {
        if (rawBatteryData.length === 0) return;
        downloadChartImage(chartSlopePlateauInstance, 'slope_plateau_analysis');
    });

    // Export cleaned rate capability summary to CSV
    btnDownloadRateData.addEventListener('click', () => {
        if (rateCapabilitySummary.length === 0) return;
        
        let csv = "C-rate,Cycle Range,Avg Charge Capacity (mAh/g),Retention (%),Avg Coulombic Efficiency (%)\n";
        rateCapabilitySummary.forEach(row => {
            csv += `${row.rate},${row.cycleRange},${row.avgCharge.toFixed(2)},${row.retention.toFixed(2)},${row.avgCE.toFixed(2)}\n`;
        });

        const blob = new Blob(["\uFEFF" + csv], { type: 'text/csv;charset=utf-8;' });
        const link = document.createElement("a");
        link.href = URL.createObjectURL(blob);
        link.setAttribute("download", "Rate_Capability_Summary.csv");
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    });
}

function downloadChartImage(chartInstance, filename) {
    if (!chartInstance) return;
    const link = document.createElement('a');
    link.download = `${filename}.png`;
    link.href = chartInstance.toBase64Image();
    link.click();
}

/* ============================================================
   GITT 분석 연산, 이벤트 바인딩 및 시각화 엔진
   ============================================================ */
function initGittEvents() {
    // 질량이 변경될 때는 용량 프로파일 차트만 실시간으로 업데이트
    if (gittMassInput) {
        gittMassInput.addEventListener('input', () => {
            if (isGittMode && gittRawData.length > 0) {
                renderGittProfileCapacityChart();
            }
        });
    }

    // 회차 선택 셀렉트박스 변경 시 현재 선택된 세그먼트를 갱신하고 차트 갱신
    if (gittDischargeCycleSelect) {
        gittDischargeCycleSelect.addEventListener('change', (e) => {
            activeGittDischargeRunIdx = parseInt(e.target.value) || 0;
            runGittAnalysis();
            if (gittCalcResultsArea && gittCalcResultsArea.style.display !== 'none') {
                if (btnCalculateGittDiffusion) btnCalculateGittDiffusion.click();
            }
        });
    }

    if (gittChargeCycleSelect) {
        gittChargeCycleSelect.addEventListener('change', (e) => {
            activeGittChargeRunIdx = parseInt(e.target.value) || 0;
            runGittAnalysis();
            if (gittCalcResultsArea && gittCalcResultsArea.style.display !== 'none') {
                if (btnCalculateGittDiffusion) btnCalculateGittDiffusion.click();
            }
        });
    }

    // 이온 확산 계수 계산 버튼 클릭 시에만 확산 계수를 연산하고 대시보드 활성화
    if (btnCalculateGittDiffusion) {
        btnCalculateGittDiffusion.addEventListener('click', () => {
            if (!isGittMode || gittRawData.length === 0) {
                alert("GITT 데이터가 로드되지 않았습니다. 파일을 먼저 업로드하거나 데모 데이터를 로드해 주세요.");
                return;
            }
            
            // 현재 활성화된 방전/충전 구간의 결과 데이터 병합
            const activeDischarge = gittDischargeRuns[activeGittDischargeRunIdx];
            const activeCharge = gittChargeRuns[activeGittChargeRunIdx];
            const activeDischargeResults = activeDischarge ? activeDischarge.results : [];
            const activeChargeResults = activeCharge ? activeCharge.results : [];
            
            gittResults = [];
            let pulseIdx = 1;
            activeDischargeResults.forEach(r => {
                gittResults.push({ ...r, pulseNo: pulseIdx++ });
            });
            activeChargeResults.forEach(r => {
                gittResults.push({ ...r, pulseNo: pulseIdx++ });
            });
            
            // 연산 및 차트, 테이블 렌더링
            calculateFinalGittDiffusion();
            renderGittDiffusionChart();
            updateGittSummaryTable();
            
            // 결과 대시보드 노출
            if (gittCalcResultsArea) {
                gittCalcResultsArea.style.display = 'grid';
                // 차트 크기 재조정 트리거
                setTimeout(() => {
                    if (chartGittDiffusionInstance) chartGittDiffusionInstance.resize();
                }, 100);
            }
        });
    }

    if (gittShowModeSelect) {
        gittShowModeSelect.addEventListener('change', () => {
            if (isGittMode && gittCalcResultsArea && gittCalcResultsArea.style.display !== 'none') {
                renderGittDiffusionChart();
                updateGittSummaryTable();
            }
        });
    }

    if (btnExportGittCsv) btnExportGittCsv.addEventListener('click', exportGittCsv);
}

function runGittAnalysis() {
    // 1단 전압 vs 시간 및 전압 vs 용량 프로파일 그리기
    renderGittProfileChart();
    renderGittProfileCapacityChart();

    // 결과 대시보드는 계산 버튼을 누르기 전까지는 숨겨둠
    if (gittCalcResultsArea) {
        gittCalcResultsArea.style.display = 'none';
    }
    if (tableGittSummaryBody) {
        tableGittSummaryBody.innerHTML = `<tr><td colspan="9" style="text-align: center; color: var(--text-muted); padding: 50px 0;">이온 확산 계수 계산 버튼을 클릭해 주십시오.</td></tr>`;
    }
}

function calculateFinalGittDiffusion() {
    const mB = parseFloat(gittMassInput.value) || 1.033; // mg
    const A = parseFloat(gittAreaInput.value) || 1.54;   // cm^2
    const V_M = parseFloat(gittVolInput.value) || 9.38;  // cm^3/mol
    const M_B = parseFloat(gittMolarMassInput.value) || 12.011; // g/mol

    const massG = mB / 1000.0;
    const factor = (massG * V_M) / (M_B * A);
    const factorSquared = Math.pow(factor, 2);

    gittResults.forEach(item => {
        item.D = item.dScaled * factorSquared;
        item.logD = item.D > 0 ? Math.log10(item.D) : -20;
    });
}

function renderGittProfileChart() {
    const canvas = document.getElementById('chartGittProfile');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (chartGittProfileInstance) {
        chartGittProfileInstance.destroy();
    }

    const stepSize = Math.max(1, Math.floor(gittRawData.length / 2000));
    const sampledData = [];
    for (let i = 0; i < gittRawData.length; i += stepSize) {
        sampledData.push(gittRawData[i]);
    }
    if (sampledData.length === 0 || sampledData[sampledData.length - 1] !== gittRawData[gittRawData.length - 1]) {
        if (gittRawData.length > 0) {
            sampledData.push(gittRawData[gittRawData.length - 1]);
        }
    }

    const timesHours = sampledData.map(d => d.time / 3600.0);
    const voltages = sampledData.map(d => d.voltage);

    const gradient = ctx.createLinearGradient(0, 0, ctx.canvas.width, 0);
    gradient.addColorStop(0, '#06b6d4');
    gradient.addColorStop(0.5, '#6366f1');
    gradient.addColorStop(1, '#ec4899');

    chartGittProfileInstance = new Chart(ctx, {
        type: 'line',
        data: {
            labels: timesHours,
            datasets: [{
                label: 'Voltage vs. Time',
                data: voltages,
                borderColor: gradient,
                borderWidth: 1.5,
                pointRadius: 0,
                fill: false,
                tension: 0.1
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { display: false },
                tooltip: {
                    mode: 'index',
                    intersect: false,
                    callbacks: {
                        label: function(context) {
                            return `Voltage: ${context.parsed.y.toFixed(4)} V`;
                        },
                        title: function(context) {
                            return `Time: ${parseFloat(context[0].label).toFixed(2)} h`;
                        }
                    }
                }
            },
            scales: {
                x: {
                    type: 'linear',
                    title: {
                        display: true,
                        text: 'Cumulative Time (h)',
                        color: 'rgba(255,255,255,0.7)',
                        font: { family: 'Outfit', size: 12, weight: 500 }
                    },
                    grid: { color: 'rgba(255,255,255,0.05)' },
                    ticks: {
                        color: 'rgba(255,255,255,0.5)',
                        callback: function(value) { return value.toFixed(1); }
                    }
                },
                y: {
                    title: {
                        display: true,
                        text: 'Voltage (V vs. Na/Na+)',
                        color: 'rgba(255,255,255,0.7)',
                        font: { family: 'Outfit', size: 12, weight: 500 }
                    },
                    grid: { color: 'rgba(255,255,255,0.05)' },
                    ticks: { color: 'rgba(255,255,255,0.5)' }
                }
            }
        }
    });
}

function renderGittProfileCapacityChart() {
    const canvas = document.getElementById('chartGittProfileCapacity');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (chartGittProfileCapacityInstance) {
        chartGittProfileCapacityInstance.destroy();
    }

    const mB = parseFloat(gittMassInput.value) || 1.033; // mg
    const activeDischarge = gittDischargeRuns[activeGittDischargeRunIdx];
    const activeCharge = gittChargeRuns[activeGittChargeRunIdx];
    
    const datasets = [];

    // 방전 데이터셋 구축 (0점 보정 및 mAh/g 변환)
    if (activeDischarge && activeDischarge.rawData.length > 0) {
        const qStart = activeDischarge.rawData[0].capacity;
        const stepSize = Math.max(1, Math.floor(activeDischarge.rawData.length / 1000));
        const sampled = [];
        for (let i = 0; i < activeDischarge.rawData.length; i += stepSize) {
            sampled.push(activeDischarge.rawData[i]);
        }
        if (sampled[sampled.length - 1] !== activeDischarge.rawData[activeDischarge.rawData.length - 1]) {
            sampled.push(activeDischarge.rawData[activeDischarge.rawData.length - 1]);
        }

        const dataPoints = sampled.map(d => ({
            x: Math.abs(d.capacity - qStart) * 1000000.0 / mB, // Ah -> mAh/g 환산
            y: d.voltage
        }));

        datasets.push({
            label: 'Discharge (Sodiation)',
            data: dataPoints,
            borderColor: '#06b6d4',
            borderWidth: 1.5,
            pointRadius: 0,
            fill: false,
            tension: 0.1
        });
    }

    // 충전 데이터셋 구축 (0점 보정 및 mAh/g 변환)
    if (activeCharge && activeCharge.rawData.length > 0) {
        const qStart = activeCharge.rawData[0].capacity;
        const stepSize = Math.max(1, Math.floor(activeCharge.rawData.length / 1000));
        const sampled = [];
        for (let i = 0; i < activeCharge.rawData.length; i += stepSize) {
            sampled.push(activeCharge.rawData[i]);
        }
        if (sampled[sampled.length - 1] !== activeCharge.rawData[activeCharge.rawData.length - 1]) {
            sampled.push(activeCharge.rawData[activeCharge.rawData.length - 1]);
        }

        const dataPoints = sampled.map(d => ({
            x: Math.abs(d.capacity - qStart) * 1000000.0 / mB, // Ah -> mAh/g 환산
            y: d.voltage
        }));

        datasets.push({
            label: 'Charge (Desodiation)',
            data: dataPoints,
            borderColor: '#ec4899',
            borderWidth: 1.5,
            pointRadius: 0,
            fill: false,
            tension: 0.1
        });
    }

    chartGittProfileCapacityInstance = new Chart(ctx, {
        type: 'line',
        data: {
            datasets: datasets
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    display: true,
                    labels: { color: 'rgba(255,255,255,0.7)', font: { family: 'Outfit', size: 10 } }
                },
                tooltip: {
                    mode: 'nearest',
                    intersect: false,
                    callbacks: {
                        label: function(context) {
                            return `${context.dataset.label}: ${context.parsed.y.toFixed(4)} V at ${context.parsed.x.toFixed(1)} mAh/g`;
                        }
                    }
                }
            },
            scales: {
                x: {
                    type: 'linear',
                    title: {
                        display: true,
                        text: 'Specific Capacity (mAh/g)',
                        color: 'rgba(255,255,255,0.7)',
                        font: { family: 'Outfit', size: 12, weight: 500 }
                    },
                    grid: { color: 'rgba(255,255,255,0.05)' },
                    ticks: {
                        color: 'rgba(255,255,255,0.5)',
                        callback: function(value) { return value.toFixed(1); }
                    }
                },
                y: {
                    title: {
                        display: true,
                        text: 'Voltage (V vs. Na/Na+)',
                        color: 'rgba(255,255,255,0.7)',
                        font: { family: 'Outfit', size: 12, weight: 500 }
                    },
                    grid: { color: 'rgba(255,255,255,0.05)' },
                    ticks: { color: 'rgba(255,255,255,0.5)' }
                }
            }
        }
    });
}

function renderGittDiffusionChart() {
    const canvas = document.getElementById('chartGittDiffusion');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (chartGittDiffusionInstance) {
        chartGittDiffusionInstance.destroy();
    }

    const showMode = gittShowModeSelect.value;
    
    let dischargePoints = gittResults.filter(r => r.mode === 'Discharge').map(r => ({ x: r.E_eq, y: r.logD }));
    let chargePoints = gittResults.filter(r => r.mode === 'Charge').map(r => ({ x: r.E_eq, y: r.logD }));

    dischargePoints.sort((a, b) => a.x - b.x);
    chargePoints.sort((a, b) => a.x - b.x);

    const datasets = [];

    if (showMode === 'both' || showMode === 'discharge') {
        datasets.push({
            label: 'Discharge (Sodiation)',
            data: dischargePoints,
            borderColor: '#06b6d4',
            backgroundColor: '#06b6d4',
            borderWidth: 2,
            pointRadius: 4,
            pointHoverRadius: 6,
            showLine: true,
            fill: false,
            tension: 0.1
        });
    }

    if (showMode === 'both' || showMode === 'charge') {
        datasets.push({
            label: 'Charge (Desodiation)',
            data: chargePoints,
            borderColor: '#ec4899',
            backgroundColor: '#ec4899',
            borderWidth: 2,
            pointRadius: 4,
            pointHoverRadius: 6,
            showLine: true,
            fill: false,
            tension: 0.1
        });
    }

    chartGittDiffusionInstance = new Chart(ctx, {
        type: 'scatter',
        data: { datasets: datasets },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    display: true,
                    labels: { color: 'rgba(255,255,255,0.7)', font: { family: 'Outfit', size: 11 } }
                },
                tooltip: {
                    callbacks: {
                        label: function(context) {
                            const dVal = Math.pow(10, context.parsed.y);
                            return `OCV: ${context.parsed.x.toFixed(4)} V, log₁₀D: ${context.parsed.y.toFixed(2)} (D: ${dVal.toExponential(2)} cm²/s)`;
                        }
                    }
                }
            },
            scales: {
                x: {
                    type: 'linear',
                    title: {
                        display: true,
                        text: 'Equilibrium Voltage E_eq (V vs. Na/Na+)',
                        color: 'rgba(255,255,255,0.7)',
                        font: { family: 'Outfit', size: 12, weight: 500 }
                    },
                    grid: { color: 'rgba(255,255,255,0.05)' },
                    ticks: { color: 'rgba(255,255,255,0.5)' }
                },
                y: {
                    type: 'linear',
                    title: {
                        display: true,
                        text: 'Diffusion Coefficient log₁₀(D / cm² s⁻¹)',
                        color: 'rgba(255,255,255,0.7)',
                        font: { family: 'Outfit', size: 12, weight: 500 }
                    },
                    grid: { color: 'rgba(255,255,255,0.05)' },
                    ticks: { color: 'rgba(255,255,255,0.5)' }
                }
            }
        }
    });
}

function updateGittSummaryTable() {
    if (!tableGittSummaryBody) return;

    if (gittResults.length === 0) {
        tableGittSummaryBody.innerHTML = `<tr><td colspan="9" style="text-align: center; color: var(--text-muted);">GITT 분석 결과가 비어 있습니다.</td></tr>`;
        return;
    }

    const showMode = gittShowModeSelect.value;
    let filteredResults = gittResults;
    if (showMode === 'discharge') {
        filteredResults = gittResults.filter(r => r.mode === 'Discharge');
    } else if (showMode === 'charge') {
        filteredResults = gittResults.filter(r => r.mode === 'Charge');
    }

    let html = '';
    filteredResults.forEach(r => {
        const modeBadge = r.mode === 'Discharge' 
            ? `<span class="badge badge-info">방전</span>` 
            : `<span class="badge badge-success">충전</span>`;

        html += `
            <tr>
                <td>${modeBadge}</td>
                <td style="font-weight:600;">Pulse ${r.pulseNo}</td>
                <td>${r.E0.toFixed(4)}</td>
                <td>${r.E_tau.toFixed(4)}</td>
                <td>${r.E_eq.toFixed(4)}</td>
                <td>${r.dEt.toFixed(4)}</td>
                <td>${r.dEs.toFixed(4)}</td>
                <td style="font-family: monospace; font-weight:500;">${r.D.toExponential(3)}</td>
                <td style="font-weight:600; color:${r.mode === 'Discharge' ? '#06b6d4' : '#ec4899'};">${r.logD.toFixed(2)}</td>
            </tr>
        `;
    });

    tableGittSummaryBody.innerHTML = html;
}

function exportGittCsv() {
    if (gittResults.length === 0) {
        alert("내보낼 GITT 분석 결과가 없습니다.");
        return;
    }

    let csvContent = "\uFEFF";
    csvContent += "Mode,PulseNo,E0_V,E_tau_V,E_eq_OCV_V,dEt_V,dEs_V,D_cm2_s,log10D\n";

    gittResults.forEach(r => {
        csvContent += `${r.mode},${r.pulseNo},${r.E0},${r.E_tau},${r.E_eq},${r.dEt},${r.dEs},${r.D.toExponential(6)},${r.logD.toFixed(4)}\n`;
    });

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", `GITT_Diffusion_Results_${activeFilename.textContent.replace(/\.[^.]+$/, '')}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
}

function parseGittExcelData(jsonData, filename) {
    if (!jsonData || jsonData.length < 2) {
        alert("엑셀 데이터가 올바르지 않거나 비어 있습니다.");
        return;
    }

    let headerRowIndex = 0;
    for (let i = 0; i < Math.min(20, jsonData.length); i++) {
        const row = jsonData[i];
        if (row && row.some(cell => typeof cell === 'string' && (cell.toLowerCase().includes('time') || cell.toLowerCase().includes('step no')))) {
            headerRowIndex = i;
            break;
        }
    }

    const headers = jsonData[headerRowIndex].map(h => String(h || '').trim());
    console.log("GITT 엑셀 헤더 감지됨:", headers);

    let timeColIdx = -1;
    let stepColIdx = -1;
    let voltColIdx = -1;
    let currColIdx = -1;
    let capColIdx = -1;

    headers.forEach((h, idx) => {
        const lowerH = h.toLowerCase().trim();
        // 1. 시간 컬럼 (테스트 누적 시간 'test time' 우선 매핑, 이미 test time이 잡혔으면 cycle/step time으로 덮어쓰지 않음)
        if (lowerH.includes('time') && (lowerH.includes('test') || lowerH.includes('cum') || lowerH.includes('total') || lowerH.includes('누적'))) {
            timeColIdx = idx;
        } else if (lowerH.includes('time') && (lowerH.includes('(s)') || lowerH.includes('test')) && timeColIdx === -1) {
            timeColIdx = idx;
        }
        
        // 2. Step No. 컬럼
        if (lowerH.includes('step') && lowerH.includes('no') && stepColIdx === -1) {
            stepColIdx = idx;
        }
        
        // 3. 전압 컬럼 (주 전압인 voltage 또는 potential 우선 매칭)
        if ((lowerH.includes('voltage') || lowerH.includes('potential') || lowerH.includes('전압') || lowerH === 'v') && !lowerH.includes('aux') && !lowerH.includes('-') && voltColIdx === -1) {
            voltColIdx = idx;
        } else if ((lowerH.includes('voltage') || lowerH.includes('potential') || lowerH.includes('전압') || lowerH === 'v') && voltColIdx === -1) {
            voltColIdx = idx;
        }
        
        // 4. 전류 컬럼
        if ((lowerH.includes('current') || lowerH.includes('전류') || lowerH === 'i') && currColIdx === -1) {
            currColIdx = idx;
        }
        
        // 5. 용량 컬럼 (누적 용량인 acc.q 또는 |q| 우선 매핑)
        if ((lowerH.includes('acc.q') || lowerH.includes('|q|') || lowerH.includes('cumulative capacity') || lowerH.includes('누적용량')) && capColIdx === -1) {
            capColIdx = idx;
        } else if ((lowerH.includes('capacity') || lowerH.includes('용량')) && capColIdx === -1) {
            capColIdx = idx;
        }
    });

    if (timeColIdx === -1 || stepColIdx === -1 || voltColIdx === -1) {
        alert("GITT 데이터 분석에 필요한 'Test Time(s)', 'Step No.', 'Voltage(V)' 컬럼을 찾을 수 없습니다.");
        return;
    }

    const dataRows = [];
    for (let i = headerRowIndex + 1; i < jsonData.length; i++) {
        const row = jsonData[i];
        if (!row || row.length === 0) continue;

        const timeVal = parseFloat(row[timeColIdx]);
        const stepVal = Math.round(parseFloat(row[stepColIdx]));
        const voltVal = parseFloat(row[voltColIdx]);
        const currVal = currColIdx !== -1 ? parseFloat(row[currColIdx]) : 0;
        let capVal = 0;
        if (capColIdx !== -1 && row[capColIdx] !== undefined) {
            capVal = parseFloat(row[capColIdx]) || 0;
        }

        if (isNaN(timeVal) || isNaN(stepVal) || isNaN(voltVal)) continue;

        dataRows.push({
            time: timeVal,
            step: stepVal,
            voltage: voltVal,
            current: currVal,
            capacity: capVal
        });
    }

    if (dataRows.length === 0) {
        alert("유효한 GITT 데이터 행이 존재하지 않습니다.");
        return;
    }

    dataRows.sort((a, b) => a.time - b.time);
    gittRawData = dataRows;

    // 다중 회차 감지 및 펄스 분할 연산 실행
    splitGittRuns(dataRows);

    isGittMode = true;
    rawBatteryData = [1];

    gittConfigPanel.style.display = 'block';
    configCard.style.display = 'none';

    const gittTabBtn = document.querySelector('.tab-btn[data-tab="tab-gitt"]');
    if (gittTabBtn) {
        tabButtons.forEach(b => b.classList.remove('active'));
        tabPanels.forEach(p => p.classList.remove('active'));
        gittTabBtn.classList.add('active');
        document.getElementById('tab-gitt').classList.add('active');
    }

    activeFilename.textContent = filename;
    document.querySelector('.header-info .badge').textContent = "LOADED";
    document.querySelector('.header-info .badge').className = "badge badge-info";

    showDatasetNameModal(filename);
}

// GITT 데이터셋 다중 방전/충전 회차 분리 헬퍼
function splitGittRuns(dataRows) {
    gittDischargeRuns = [];
    gittChargeRuns = [];
    
    let currentRun = null;
    let lastMode = null; // 'discharge' or 'charge'
    
    dataRows.forEach(d => {
        const isDischargeStep = (d.step === 2 || d.step === 3);
        const isChargeStep = (d.step === 4 || d.step === 5);
        
        if (isDischargeStep) {
            if (lastMode !== 'discharge') {
                currentRun = {
                    runIndex: gittDischargeRuns.length + 1,
                    rawData: [],
                    results: []
                };
                gittDischargeRuns.push(currentRun);
                lastMode = 'discharge';
            }
            currentRun.rawData.push(d);
        } else if (isChargeStep) {
            if (lastMode !== 'charge') {
                currentRun = {
                    runIndex: gittChargeRuns.length + 1,
                    rawData: [],
                    results: []
                };
                gittChargeRuns.push(currentRun);
                lastMode = 'charge';
            }
            currentRun.rawData.push(d);
        }
    });
    
    // 검출 안전 장치
    if (gittDischargeRuns.length === 0 && gittRawData.length > 0) {
        gittDischargeRuns.push({
            runIndex: 1,
            rawData: gittRawData.filter(d => d.step === 2 || d.step === 3),
            results: []
        });
    }
    if (gittChargeRuns.length === 0 && gittRawData.length > 0) {
        gittChargeRuns.push({
            runIndex: 1,
            rawData: gittRawData.filter(d => d.step === 4 || d.step === 5),
            results: []
        });
    }
    
    // 각 회차별 펄스 계산
    gittDischargeRuns.forEach(run => {
        run.results = calculateGittPulsesForData(run.rawData, 'Discharge');
    });
    gittChargeRuns.forEach(run => {
        run.results = calculateGittPulsesForData(run.rawData, 'Charge');
    });
    
    updateGittCycleSelectors();
}

// 특정 회차의 rawData 내에서 GITT 펄스를 감지하고 E0, E_tau, E_eq 등 펄스별 계수 추출
function calculateGittPulsesForData(rawData, mode) {
    if (!rawData || rawData.length === 0) return [];
    
    let segments = [];
    let currentSegment = {
        stepNo: rawData[0].step,
        data: [rawData[0]]
    };

    for (let i = 1; i < rawData.length; i++) {
        const row = rawData[i];
        if (row.step !== currentSegment.stepNo) {
            segments.push(currentSegment);
            currentSegment = {
                stepNo: row.step,
                data: [row]
            };
        } else {
            currentSegment.data.push(row);
        }
    }
    segments.push(currentSegment);

    let results = [];
    let pulseCount = 0;

    for (let i = 0; i < segments.length; i++) {
        const seg = segments[i];
        const stepNo = seg.stepNo;

        if ((mode === 'Discharge' && stepNo === 2) || (mode === 'Charge' && stepNo === 4)) {
            const pulseData = seg.data;
            const pulseDuration = pulseData[pulseData.length - 1].time - pulseData[0].time;

            if (pulseDuration < 300 || pulseDuration > 900) {
                continue;
            }

            const prevSeg = i - 1 >= 0 ? segments[i - 1] : null;
            const nextSeg = i + 1 < segments.length ? segments[i + 1] : null;

            if (prevSeg && nextSeg) {
                const prevRestData = prevSeg.data;
                const nextRestData = nextSeg.data;

                const E0 = prevRestData[prevRestData.length - 1].voltage;
                const E_tau = pulseData[pulseData.length - 1].voltage;
                const E_eq = nextRestData[nextRestData.length - 1].voltage;

                const dEt = Math.abs(E_tau - E0);
                const dEs = Math.abs(E_eq - E0);
                const capacity = pulseData[pulseData.length - 1].capacity;

                results.push({
                    mode: mode,
                    pulseNo: ++pulseCount,
                    E0: E0,
                    E_tau: E_tau,
                    E_eq: E_eq,
                    dEt: dEt,
                    dEs: dEs,
                    dScaled: dEt > 0 ? (4 / (Math.PI * 600)) * Math.pow(dEs / dEt, 2) : 0,
                    capacity: capacity
                });
            }
        }
    }
    return results;
}

// 셀렉트 박스 옵션 동적 갱신
function updateGittCycleSelectors() {
    if (!gittDischargeCycleSelect || !gittChargeCycleSelect) return;
    
    gittDischargeCycleSelect.innerHTML = gittDischargeRuns.map((r, i) => 
        `<option value="${i}">방전 회차 ${r.runIndex} (${r.results.length} 펄스)</option>`
    ).join('');
    
    gittChargeCycleSelect.innerHTML = gittChargeRuns.map((r, i) => 
        `<option value="${i}">충전 회차 ${r.runIndex} (${r.results.length} 펄스)</option>`
    ).join('');
    
    activeGittDischargeRunIdx = 0;
    activeGittChargeRunIdx = 0;
}

/* ============================================================
   메인 분석 모드 (일반 성능 분석 vs GITT 확산 계수 분석) 제어
   ============================================================ */
function initAnalysisModes() {
    if (btnModeGeneral) {
        btnModeGeneral.addEventListener('click', () => {
            if (currentAnalysisMode === 'general') return;
            setAnalysisMode('general');
        });
    }
    if (btnModeGitt) {
        btnModeGitt.addEventListener('click', () => {
            if (currentAnalysisMode === 'gitt') return;
            setAnalysisMode('gitt');
        });
    }
}

function setAnalysisMode(mode) {
    currentAnalysisMode = mode;
    
    // 모드 버튼 활성화 표시 제어
    if (mode === 'general') {
        if (btnModeGeneral) btnModeGeneral.classList.add('active');
        if (btnModeGitt) btnModeGitt.classList.remove('active');
    } else {
        if (btnModeGeneral) btnModeGeneral.classList.remove('active');
        if (btnModeGitt) btnModeGitt.classList.add('active');
    }
    
    // 탭 헤더 버튼 노출/숨김 제어
    const tabBtns = document.querySelectorAll('.tab-btn');
    tabBtns.forEach(btn => {
        const tabId = btn.getAttribute('data-tab');
        if (mode === 'general') {
            if (tabId === 'tab-gitt') {
                btn.style.display = 'none';
            } else {
                btn.style.display = 'inline-flex';
            }
        } else {
            if (tabId === 'tab-gitt') {
                btn.style.display = 'inline-flex';
            } else {
                btn.style.display = 'none';
            }
        }
    });
    
    // 사이드바 설정 영역 제어
    if (mode === 'general') {
        if (rateConfigPanel) rateConfigPanel.style.display = 'block';
        if (gittConfigPanel) gittConfigPanel.style.display = 'none';
        if (btnDemoData) btnDemoData.style.display = 'inline-flex';
        if (btnGittDemoData) btnGittDemoData.style.display = 'none';
    } else {
        if (rateConfigPanel) rateConfigPanel.style.display = 'none';
        if (gittConfigPanel) gittConfigPanel.style.display = 'block';
        if (btnDemoData) btnDemoData.style.display = 'none';
        if (btnGittDemoData) btnGittDemoData.style.display = 'inline-flex';
    }
    
    // 웰컴 뷰 컨텐츠 업데이트
    updateWelcomeViewContent();
    
    // 모드에 맞는 데이터셋 필터링하여 데이터 확인
    const filtered = datasetLibrary.filter(ds => mode === 'gitt' ? ds.isGitt === true : !ds.isGitt);
    
    if (filtered.length > 0) {
        if (welcomeView) welcomeView.style.display = 'none';
        
        // 현재 활성 데이터셋이 맞지 않는 모드이면, 바뀐 모드의 첫 번째 데이터셋으로 활성화
        const activeDs = datasetLibrary.find(d => d.id === activeDatasetId);
        if (!activeDs || (mode === 'gitt' && !activeDs.isGitt) || (mode === 'general' && activeDs.isGitt)) {
            switchActiveDataset(filtered[0].id);
        } else {
            // 현재 활성 데이터셋이 모드에 부합하면 분석 및 탭 갱신 실행
            if (mode === 'gitt') {
                const gittTabBtn = document.querySelector('.tab-btn[data-tab="tab-gitt"]');
                if (gittTabBtn) gittTabBtn.click();
            } else {
                const activeTabBtn = document.querySelector('.tab-btn.active');
                if (!activeTabBtn || activeTabBtn.getAttribute('data-tab') === 'tab-gitt') {
                    const fallbackBtn = document.querySelector('.tab-btn[data-tab="tab-overview"]');
                    if (fallbackBtn) fallbackBtn.click();
                } else {
                    runAnalysis();
                }
            }
        }
    } else {
        // 데이터가 없어도 웰컴 화면을 노출하지 않고 빈 대시보드 화면을 띄웁니다.
        if (welcomeView) welcomeView.style.display = 'none';
        
        tabPanels.forEach(p => p.classList.remove('active'));
        tabBtns.forEach(b => b.classList.remove('active'));
        
        // 데이터가 없는 기본 상태에서도 탭 버튼과 패널의 active 상태를 매칭해 줍니다.
        if (mode === 'general') {
            const fallbackBtn = document.querySelector('.tab-btn[data-tab="tab-overview"]');
            if (fallbackBtn) fallbackBtn.classList.add('active');
            const fallbackPanel = document.getElementById('tab-overview');
            if (fallbackPanel) fallbackPanel.classList.add('active');
        } else {
            const fallbackBtn = document.querySelector('.tab-btn[data-tab="tab-gitt"]');
            if (fallbackBtn) fallbackBtn.classList.add('active');
            const fallbackPanel = document.getElementById('tab-gitt');
            if (fallbackPanel) fallbackPanel.classList.add('active');
        }
    }
    
    // 라이브러리 UI 렌더링 갱신
    renderDatasetLibraryUI();
}

function updateWelcomeViewContent() {
    if (currentAnalysisMode === 'general') {
        if (welcomeIcon) welcomeIcon.textContent = 'query_stats';
        if (welcomeTitle) welcomeTitle.textContent = '하드카본 전기화학 데이터 분석기';
        if (welcomeDesc) {
            welcomeDesc.innerHTML = `하드카본의 고유한 거동인 <strong>Slope (경사)</strong> 영역과 <strong>Plateau (평탄)</strong> 영역의 가역 용량을 완벽하게 구분하여 분석합니다.<br>
            초기 가역 효율(ICE)과 율속 특성(Rate Capability) 데이터를 자동으로 파싱하여 논문 투고용 차트로 가시화해 줍니다.`;
        }
        if (welcomeDemoBtnText) welcomeDemoBtnText.textContent = '데모 데이터로 즉시 시작하기';
        if (welcomeDemoBtnIcon) welcomeDemoBtnIcon.textContent = 'bolt';
    } else {
        if (welcomeIcon) welcomeIcon.textContent = 'insights';
        if (welcomeTitle) welcomeTitle.textContent = '하드카본 GITT 분석기';
        if (welcomeDesc) {
            welcomeDesc.innerHTML = `하드카본의 <strong>GITT (Galvanostatic Intermittent Titration Technique)</strong> 데이터를 분석합니다.<br>
            충전과 방전을 각각 분리하여 용량에 따른 전압 변화를 피팅하고, 펄스별 OCV 평형 전압에 따른 이온 확산 계수($D$) 변화를 자동으로 산출 및 가시화해 줍니다.`;
        }
        if (welcomeDemoBtnText) welcomeDemoBtnText.textContent = 'GITT 데모 데이터 로드';
        if (welcomeDemoBtnIcon) welcomeDemoBtnIcon.textContent = 'insights';
    }
}
