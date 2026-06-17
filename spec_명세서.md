# 하드카본 전기화학 데이터 분석기 (MVP) 스펙 명세서

본 문서는 하드카본 개질 연구용 전기화학 데이터 분석 웹사이트 MVP 버전에 적용된 세부 기능 규격, 데이터 분석 로직, 그리고 기술 사양을 정의하는 최종 명세서입니다.

---

## 1. 프로젝트 개요 (Overview)
* **목적**: 하드카본 음극재 개질 연구 시 탑티어(Top-tier) 저널 논문 투고에 필수적인 정량적 데이터(Slope/Plateau 분율, ICE, Rate Capability)를 브라우저 상에서 즉시 파싱, 연산, 시각화하여 연구 효율성을 향상시킵니다.
* **사용 대상**: 하드카본 개질 연구 석/박사 과정생 및 배터리 소재 연구원
* **동작 방식**: 서버 통신이 필요 없는 **클라이언트 사이드(Client-side) 정적 웹 애플리케이션**으로, 업로드된 연구 데이터의 보안 유출 우려 없이 브라우저 메모리 내에서 즉각적으로 연산이 수행됩니다.

---

## 2. 기술 스택 및 구동 환경 (Technical Stack)
* **프론트엔드 핵심**: HTML5, Vanilla CSS3 (Sleek Dark UI), JavaScript (ES6+)
* **시각화 엔진**: Chart.js v4.x (CDN 연동)
* **아이콘 & 폰트**: Google Fonts (Outfit, Noto Sans KR), Google Material Icons (Round)
* **구동 웹 브라우저**: Google Chrome, Microsoft Edge, Safari 등 최신 모던 브라우저 호환

---

## 3. 핵심 전기화학 분석 기능 규격 (Core Analysis Specs)

### 3.1. 초기 용량 & ICE(초기 가역 효율) 분석
* **목적**: 전극의 첫 번째 사이클 가역 가용 성능과 초기 전해질 분해에 따른 SEI(Solid Electrolyte Interphase) 손실 비중을 파악합니다.
* **세부 연산 로직**:
  * $1\text{st Cycle}$ 데이터 내에서 전압의 하강 흐름(Sodiation/소듐화) 및 상승 흐름(Desodiation/탈소듐화)을 감지합니다.
  * **초기 소듐화 용량(Initial Discharge Capacity)**: $1\text{st Cycle}$의 Sodiation 최종 용량 값.
  * **초기 탈소듐화 용량(Initial Charge Capacity)**: $1\text{st Cycle}$의 Desodiation 최종 용량 값.
  * **초기 가역 효율(ICE, %)**:
    $$\text{ICE (\%)} = \left( \frac{\text{Initial Charge Capacity}}{\text{Initial Discharge Capacity}} \right) \times 100$$
* **출력 데이터**: 수치 데이터 카드(mAh/g 및 %), 1st Cycle 충방전 프로파일 오버레이 그래프
* **판정 기준**:
  * **$\ge 85.0\%$**: 우수한 효율 등급 (Top-tier SIB 수준)
  * **$75.0\% \sim 84.9\%$**: 보통 효율 등급 (SEI 제어 보완 필요)
  * **$< 75.0\%$**: 낮은 효율 등급 (넓은 비표면적 또는 기공 노출에 의한 SEI 형성 손실 의심)

### 3.2. Slope / Plateau 영역 분리 분석 (Sodiation)
* **목적**: 하드카본 고유의 충방전 거동 영역인 Slope(탄소 층간 삽입/흡착)와 Plateau(밀폐 나노기공 내 금속 클러스터링) 용량을 정량 계산하여 개질 메커니즘을 증명합니다.
* **세부 연산 로직**:
  * 사용자가 입력한 **Plateau 분리 전압(Cut-off Voltage)** $V_{cutoff}$ (기본값: $0.10\text{ V}$)을 기준으로 데이터를 분류합니다.
  * **Slope 용량 ($Q_{slope}$)**: Sodiation 곡선에서 전압이 방전 시작점부터 $V_{cutoff}$에 도달할 때까지 누적된 용량.
  * **Plateau 용량 ($Q_{plateau}$)**: Sodiation 곡선에서 전압이 $V_{cutoff}$ 이하에서 최종 방전 컷오프 전압($0.01\text{ V}$)까지 누적된 용량.
  * **영역 분율 계산**:
    $$\text{Slope Ratio (\%)} = \left( \frac{Q_{slope}}{Q_{total}} \right) \times 100$$
    $$\text{Plateau Ratio (\%)} = \left( \frac{Q_{plateau}}{Q_{total}} \right) \times 100$$
* **시각화 구현**: 전압-용량 곡선 중 Slope 영역은 **Cyan**, Plateau 영역은 **Purple** 선으로 실시간 분리 하이라이트 처리하며, $V_{cutoff}$ 경계선은 **Red 점선**으로 표시합니다.

### 3.3. Rate Capability (율속 특성) 분석
* **목적**: 다양한 충방전 속도(C-rate)에서의 용량 유지 특성을 평가하여 동역학적 우수성을 검증합니다.
* **세부 연산 로직**:
  * 전체 데이터를 **5사이클 단위**로 묶어 하나의 C-rate 단계로 그룹화합니다. (기본 매핑: $0.1\text{C} \to 0.2\text{C} \to 0.5\text{C} \to 1\text{C} \to 2\text{C} \to 0.1\text{C}$ 복원)
  * **단계별 평균 방전 용량**: 해당 그룹에 속하는 5개 사이클 방전 용량의 산술 평균값.
  * **용량 유지율(Retention, %)**: 첫 번째 단계($0.1\text{C}$)의 평균 방전 용량($Q_{0.1C, avg}$) 대비 해당 C-rate 단계의 평균 방전 용량 비율.
    $$\text{Retention (\%)} = \left( \frac{Q_{rate, avg}}{Q_{0.1C, avg}} \right) \times 100$$
* **시각화 구현**: 
  * 사이클 경과에 따른 방전 용량 추이를 나타내는 꺾은선 그래프 (C-rate 단계별 포인트 색상 매핑).
  * C-rate 단계별 평균 용량을 나타내는 막대그래프.

---

## 4. 데이터 포맷 및 파서 사양 (Data Parsing Specs)
* **지원 포맷**: ASCII 텍스트 형식의 `.csv`, `.txt` 파일
* **구분자(Delimiter)**: 쉼표(`,`), 탭(`\t`), 세미콜론(`;`) 자동 감지
* **동적 칼럼 매핑 (Column Mapping)**: 
  * 로딩 시 파일의 헤더 단어 분석을 통해 사이클(Cycle), 전압(Voltage), 용량(Capacity), 전류(Current) 열을 자동 매칭합니다.
  * 자동 매칭이 어긋날 경우, 사용자가 사이드바의 셀렉트박스를 이용해 직접 컬럼 인덱스를 변경하여 유연하게 대처할 수 있습니다.

---

## 5. 논문 작성 보조 기능 (Discussion Generator)
하드카본 분야의 저널 심사 시 자주 묻는 논증 포인트를 보완하기 위해, 분율 계산 결과에 따라 다음과 같이 학술적인 코멘트 템플릿을 화면에 제공합니다.

| 조건 | 핵심 메커니즘 | 추천 디스커션 방향 |
| :--- | :--- | :--- |
| **Plateau 분율 > 55%** | closed nanopore clustering 지배형 | 고온 탄화 등에 의한 폐쇄 기공 발달 강조, NLDFT 기공 분석 데이터와의 매칭 권장. 단, ICE 손실에 따른 SEI 패시베이션 논리 보완 조언. |
| **Slope 분율 > 55%** | defect & edge adsorption / intercalation 지배형 | 헤테로 원소 도핑에 의한 표면 활성 결함점 및 확장 격자 구조 역할 강조, XPS 결합 분석과 커패시터 기여율 논증 연계 조언. |
| **두 영역 균형 발달** | 층간 삽입과 나노기공 적층 저장의 조화 | 고율 방전 시 안정적인 용량 유지와 높은 가역 효율의 원인을 복합 메커니즘 관점에서 서술하도록 유도. |

---

## 6. 데이터 익스포트 스펙 (Data Export Specs)
* **이미지 익스포트**: 활성화된 두 개의 차트(Voltage Profile, Slope/Plateau Highlight)를 고해상도 PNG 이미지로 다운로드할 수 있는 원버튼 기능 제공.
* **수치 요약 익스포트**: C-rate 단계별 사이클 구간, 평균 용량, 유지율, 쿨롱 효율 수치가 담긴 **CSV 형태의 요약 데이터** 다운로드 기능 제공 (Origin 및 Excel 연동 용이).
